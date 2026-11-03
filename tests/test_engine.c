#include "engine.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do {if(!(x)){fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x);exit(1);}} while(0)
int main(void){
 Word a,b;int t[MAX_TOKENS];
 CHECK(normalize_word("사과",0,&a)&&a.length==5);
 CHECK(a.tokens[3]==0x3157&&a.tokens[4]==0x314f);
 CHECK(normalize_word("학교",0,&a)&&a.length==5);
 CHECK(normalize_word("값이",0,&a)&&a.length==6);
 CHECK(normalize_word("꽈배기",0,&a)&&a.length==7&&a.tokens[0]==0x3132&&a.tokens[4]==0x3150);
 CHECK(normalize_word("괜찮다",0,&a)&&a.length==10);
 CHECK(normalize_word("사과",0,&b)&&!strcmp(b.text,"사과"));
 CHECK(!normalize_word("abc가",0,&a));CHECK(!normalize_word("\xff",0,&a));
 CHECK(!normalize_word("12345",1,&a));CHECK(!normalize_word("abcdefghijkl",1,&a));
 CHECK(normalize_word(" APPLE ",1,&a)&&!strcmp(a.text,"apple"));
 CHECK(normalize_word("allee",1,&b));CHECK(judge(&a,&b,t)==0);
 CHECK(t[0]==2&&t[1]==1&&t[2]==0&&t[3]==0&&t[4]==2);
 CHECK(judge(&a,&a,t)==1);
 CHECK(dictionaries_load());CHECK(dictionary_contains(0,"사과"));CHECK(dictionary_contains(1,"apple"));
 for(int l=0;l<2;l++)for(int n=5;n<=(l?8:12);n++){int idx[MAX_ANSWERS];CHECK(answer_indices(l,n,idx)>0);}
 puts("All engine and dictionary tests passed");return 0;
}
