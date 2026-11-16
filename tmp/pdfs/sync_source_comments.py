import ast
import re
from pathlib import Path

root=Path(__file__).resolve().parents[2]
tree=ast.parse((root/'tmp/pdfs/create_extended.py').read_text(encoding='utf-8'))
code_fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='code')
notes=ast.literal_eval(code_fn.body[0].value)
targets={name:(root/name).read_text(encoding='utf-8') for name in ['src/wordle.c','web/engine.js','web/app.js']}
ranges={name:[] for name in targets}
for node in tree.body:
 if not isinstance(node,ast.Expr) or not isinstance(node.value,ast.Call):continue
 call=node.value
 if not isinstance(call.func,ast.Name) or call.func.id!='excerpt':continue
 file,start,end=[ast.literal_eval(a) for a in call.args]
 source=targets[file]; a=source.index(start); b=source.index(end,a)
 ranges[file].append((a,b))

def tokens(s):
 # Preserve quoted text while ignoring comments and whitespace.
 pattern=r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|/\*[\s\S]*?\*/|//[^\n]*|\s+|.'''
 return [m.group() for m in re.finditer(pattern,s) if not m.group().isspace() and not m.group().startswith(('//','/*'))]

used=set()
for name,source in targets.items():
 out=[]; offset=0; count=0
 for line in source.splitlines(keepends=True):
  original_length=len(line)
  active=any(a<=offset+len(line)-len(line.lstrip())<b for a,b in ranges[name])
  key=line.strip()
  # The PDF also includes this buffer declaration outside excerpt calls.
  if name=='src/wordle.c' and key.startswith('static uint32_t in_buf'):active=True
  if name=='src/wordle.c' and key.startswith('WD_EXPORT(wd_judge) void js_judge'):
   out.append('WD_EXPORT(wd_judge) void js_judge(int n) {\n')
   out.append('    // '+notes['wd_judge(in_buf']+'\n')
   out.append('    wd_judge(in_buf, in_buf + n, n, out_buf);\n}\n')
   used.add('wd_judge(in_buf'); count+=1
  else:
   if active:
    for prefix,note in notes.items():
     if key.startswith(prefix):
      indent=line[:len(line)-len(line.lstrip())]
      out.append(indent+'// '+note+'\n')
      used.add(prefix); count+=1
      # Remove inline comments that repeat the newly inserted explanation.
      if prefix in ['if (same(answers', 'if (composing ||', 'const len = put(codePoints']:
       line=re.sub(r'\s*(/\*.*?\*/|//[^\n]*)', '', line.rstrip())+'\n'
      break
   out.append(line)
  offset+=original_length
 updated=''.join(out)
 assert tokens(source)==tokens(updated),f'Non-comment change in {name}'
 (root/name).write_text(updated,encoding='utf-8')
 print(name, count, 'comments; executable tokens unchanged')
assert used==set(notes),set(notes)-used
