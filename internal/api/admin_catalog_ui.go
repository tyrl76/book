package api

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) adminBookSearch(response http.ResponseWriter, _ *http.Request) {
	nonceBytes := make([]byte, 18)
	if _, err := rand.Read(nonceBytes); err != nil {
		s.internalError(response, err)
		return
	}
	nonce := base64.RawStdEncoding.EncodeToString(nonceBytes)
	response.Header().Set("Content-Type", "text/html; charset=utf-8")
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("Referrer-Policy", "no-referrer")
	response.Header().Set("X-Content-Type-Options", "nosniff")
	response.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'nonce-"+nonce+"'; script-src 'nonce-"+nonce+"'; connect-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
	page := strings.ReplaceAll(adminBookSearchHTML, "{{NONCE}}", nonce)
	page = strings.ReplaceAll(page, "{{ADMIN_OPEN_ACCESS}}", strconv.FormatBool(s.adminOpenAccess))
	_, _ = response.Write([]byte(page))
}

const adminBookSearchHTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark"><title>도서 검색 · 책결</title>
<style nonce="{{NONCE}}">
:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color-scheme:light;--canvas:#f3f0e8;--surface:#fffdf8;--surface2:#ebe7dd;--ink:#19362d;--muted:#69766f;--line:#dcd7cb;--brand:#2f6754;--accent:#c66d52;--danger:#b34838;--shadow:0 18px 48px rgba(34,58,48,.09)}
:root[data-theme="dark"]{color-scheme:dark;--canvas:#101713;--surface:#18231e;--surface2:#222f29;--ink:#edf5f0;--muted:#aab8b0;--line:#33463c;--brand:#72ad91;--accent:#e08a70;--danger:#ed8f80;--shadow:0 18px 48px rgba(0,0,0,.22)}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--canvas:#101713;--surface:#18231e;--surface2:#222f29;--ink:#edf5f0;--muted:#aab8b0;--line:#33463c;--brand:#72ad91;--accent:#e08a70;--danger:#ed8f80;--shadow:0 18px 48px rgba(0,0,0,.22)}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);min-height:100vh}.shell{max-width:1180px;margin:auto;padding:28px 22px 72px}.top{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:32px}.brand{display:flex;align-items:center;gap:13px}.mark{width:46px;height:46px;border-radius:15px;background:var(--brand);color:var(--surface);display:grid;place-items:center;font-weight:950;font-size:19px;box-shadow:0 10px 22px rgba(47,103,84,.22)}h1{font-size:25px;margin:0;letter-spacing:-.5px}.eyebrow{font-size:10px;font-weight:900;letter-spacing:1.8px;color:var(--brand);margin-bottom:3px}.top-actions{display:flex;gap:8px;align-items:center}.button,.icon-button{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:12px;font-weight:800;text-decoration:none;cursor:pointer}.button{padding:11px 15px}.icon-button{width:42px;height:42px}.hero{max-width:760px;margin-bottom:24px}.hero h2{font-size:34px;line-height:1.2;letter-spacing:-1.3px;margin:0 0 9px}.hero p{color:var(--muted);line-height:1.6;margin:0}.search-box{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:19px;padding:10px;box-shadow:var(--shadow);margin:22px 0 14px}.field{width:100%;border:0;background:transparent;color:var(--ink);padding:11px 12px;font:inherit;font-size:16px;outline:none}.search-button{border:0;border-radius:13px;background:var(--brand);color:var(--surface);padding:0 22px;font:inherit;font-weight:900;cursor:pointer}.search-button:disabled{opacity:.5;cursor:wait}.key-box{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px;border:1px solid var(--line);border-radius:15px;background:var(--surface);margin-bottom:14px}.key-box[hidden]{display:none}.key-box .field{border:1px solid var(--line);border-radius:10px;background:var(--canvas);font-size:13px;padding:9px 11px}.status{min-height:24px;color:var(--muted);font-size:13px;margin-bottom:14px}.status.error{color:var(--danger);font-weight:750}.results{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.book{display:grid;grid-template-columns:102px minmax(0,1fr);gap:15px;background:var(--surface);border:1px solid var(--line);border-radius:19px;padding:15px;box-shadow:var(--shadow);min-height:188px}.cover{width:102px;height:148px;object-fit:cover;border-radius:11px;background:var(--surface2);box-shadow:0 8px 18px rgba(30,48,40,.12)}.cover-placeholder{width:102px;height:148px;border-radius:11px;background:var(--surface2);display:grid;place-items:center;color:var(--muted);font-size:12px}.book-body{min-width:0;display:flex;flex-direction:column}.book h3{font-size:16px;line-height:1.35;margin:2px 0 7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.author{font-size:12px;color:var(--brand);font-weight:800;margin-bottom:5px}.meta{font-size:11px;color:var(--muted);line-height:1.5}.description{font-size:12px;color:var(--muted);line-height:1.5;margin:10px 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.detail{color:var(--brand);font-size:12px;font-weight:850;text-decoration:none;margin-top:auto}.empty{grid-column:1/-1;padding:56px 20px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:19px;background:color-mix(in srgb,var(--surface) 55%,transparent)}
@media(max-width:980px){.results{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:660px){.shell{padding:19px 13px 56px}.top{align-items:flex-start}.hero h2{font-size:28px}.results{grid-template-columns:1fr}.book{grid-template-columns:88px minmax(0,1fr);padding:13px}.cover,.cover-placeholder{width:88px;height:128px}.top-actions .button{font-size:12px;padding:10px}.search-button{padding:0 17px}.key-box{grid-template-columns:1fr}.key-box .button{width:100%}}
</style></head><body><main class="shell">
<header class="top"><div class="brand"><div class="mark">책</div><div><div class="eyebrow">BOOKGYEOL CATALOG</div><h1>도서 검색</h1></div></div><div class="top-actions"><a class="button" href="/admin">운영 센터</a><button class="icon-button" id="themeBtn" aria-label="테마 변경" title="테마 변경">◐</button></div></header>
<section class="hero"><h2>읽고 싶은 책을 찾아보세요.</h2><p>카카오 도서 검색 결과를 실제 앱과 동일한 서버 경로로 확인합니다.</p></section>
<div id="keyBox" class="key-box" hidden><input class="field" id="adminKey" type="password" placeholder="ADMIN_API_KEY" autocomplete="off" aria-label="관리자 API 키"><button class="button" id="saveKey">연결</button></div>
<form id="searchForm" class="search-box"><input class="field" id="query" type="search" value="한강" minlength="2" maxlength="100" placeholder="책 제목, 저자, 출판사를 입력하세요" aria-label="도서 검색어" autocomplete="off"><button class="search-button" id="searchButton" type="submit">검색</button></form>
<div id="status" class="status" role="status" aria-live="polite">검색할 준비가 되었습니다.</div><section id="results" class="results" aria-label="도서 검색 결과"></section>
</main><script nonce="{{NONCE}}">
const $=id=>document.getElementById(id),openAccess={{ADMIN_OPEN_ACCESS}};
let key=openAccess?'':sessionStorage.getItem('bookgyeol.adminKey')||'';
function text(tag,value,cls=''){const node=document.createElement(tag);if(cls)node.className=cls;node.textContent=value||'';return node}
function safeURL(value){try{const parsed=new URL(value);return parsed.protocol==='https:'?parsed.href:''}catch{return ''}}
function setStatus(value,error=false){const node=$('status');node.textContent=value;node.classList.toggle('error',error)}
function render(items){const results=$('results');if(!items.length){results.replaceChildren(text('div','검색 결과가 없습니다. 다른 검색어를 입력해 보세요.','empty'));return}const fragment=document.createDocumentFragment();for(const item of items){const card=text('article','','book'),coverURL=safeURL(item.coverUrl);let cover;if(coverURL){cover=document.createElement('img');cover.className='cover';cover.src=coverURL;cover.alt=item.title+' 표지';cover.loading='lazy';cover.referrerPolicy='no-referrer'}else cover=text('div','표지 없음','cover-placeholder');const body=text('div','','book-body');body.append(text('h3',item.title),text('div',item.author||'저자 미상','author'));const meta=[item.publisher,item.publishedAt?item.publishedAt.slice(0,10):'',item.isbn?'ISBN '+item.isbn:''].filter(Boolean).join(' · ');body.append(text('div',meta,'meta'));if(item.description)body.append(text('p',item.description,'description'));const detailURL=safeURL(item.detailUrl);if(detailURL){const link=text('a','카카오 책 정보 보기 →','detail');link.href=detailURL;link.target='_blank';link.rel='noopener noreferrer';body.append(link)}card.append(cover,body);fragment.append(card)}results.replaceChildren(fragment)}
async function search(event){event?.preventDefault();const query=$('query').value.trim();if([...query].length<2){setStatus('검색어를 두 글자 이상 입력해 주세요.',true);$('query').focus();return}if(!openAccess&&!key){$('keyBox').hidden=false;setStatus('관리자 API 키로 먼저 연결해 주세요.',true);return}const button=$('searchButton');button.disabled=true;setStatus('“'+query+'” 검색 중…');try{const response=await fetch('/v1/admin/catalog/books?query='+encodeURIComponent(query)+'&limit=24',{headers:{Accept:'application/json','X-Admin-Key':key}});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error?.message||'검색 요청에 실패했습니다.');render(body.items||[]);setStatus((body.items||[]).length+'권을 찾았습니다.')}catch(error){render([]);setStatus(error.message,true)}finally{button.disabled=false}}
$('searchForm').onsubmit=search;$('saveKey').onclick=()=>{key=$('adminKey').value.trim();if(key){sessionStorage.setItem('bookgyeol.adminKey',key);$('keyBox').hidden=true;search()}};
function applyTheme(value){document.documentElement.dataset.theme=value==='auto'?'':value;localStorage.setItem('bookgyeol.adminTheme',value);$('themeBtn').dataset.value=value;$('themeBtn').title='테마: '+({auto:'시스템',light:'라이트',dark:'다크'}[value])}
$('themeBtn').onclick=()=>{const order=['auto','light','dark'],current=$('themeBtn').dataset.value||'auto';applyTheme(order[(order.indexOf(current)+1)%order.length])};applyTheme(localStorage.getItem('bookgyeol.adminTheme')||'auto');$('keyBox').hidden=openAccess||Boolean(key);$('adminKey').value=key;search();
</script></body></html>`
