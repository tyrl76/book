package api

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
)

func (s *Server) adminConsole(response http.ResponseWriter, _ *http.Request) {
	nonceBytes := make([]byte, 18)
	if _, err := rand.Read(nonceBytes); err != nil {
		s.internalError(response, err)
		return
	}
	nonce := base64.RawStdEncoding.EncodeToString(nonceBytes)
	response.Header().Set("Content-Type", "text/html; charset=utf-8")
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'nonce-"+nonce+"'; script-src 'nonce-"+nonce+"'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
	_, _ = response.Write([]byte(strings.ReplaceAll(adminConsoleHTML, "{{NONCE}}", nonce)))
}

const adminConsoleHTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>책결 운영 콘솔</title>
<style nonce="{{NONCE}}">
:root{color-scheme:light dark;font-family:Inter,Pretendard,system-ui,sans-serif;background:#f5f1e8;color:#18332a}*{box-sizing:border-box}
body{margin:0}.shell{max-width:1180px;margin:auto;padding:32px 20px 80px}.top{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:24px}
h1{margin:4px 0;font-size:32px}.eyebrow{font-size:11px;font-weight:900;letter-spacing:2px;color:#2e6653}.sub{color:#617068;margin:0}
.auth,.toolbar,.card{background:#fff;border:1px solid #ddd7cb;border-radius:18px;box-shadow:0 12px 32px #24352c10}.auth{padding:18px;display:grid;grid-template-columns:1fr 1fr auto;gap:12px;margin-bottom:18px}
input,select,button,textarea{font:inherit;border-radius:11px;border:1px solid #d5d0c5;padding:11px 13px;background:#fff;color:#18332a}button{cursor:pointer;font-weight:800}.primary{background:#2e6653;color:white;border-color:#2e6653}
.toolbar{padding:14px;display:flex;gap:10px;margin-bottom:18px}.grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,.8fr);gap:18px}.panel h2{font-size:18px}.list{display:grid;gap:12px}
.card{padding:18px}.meta{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#66746d}.pill{background:#edf3ef;padding:5px 8px;border-radius:99px}.detail{white-space:pre-wrap;margin:14px 0;line-height:1.55}.actions{display:flex;gap:7px;flex-wrap:wrap}.danger{color:#a33a2a;border-color:#e7b6ae}.empty{padding:40px;text-align:center;color:#6c776f}
.audit{font-size:13px}.audit strong{display:block;margin-bottom:6px}.message{min-height:20px;margin:10px 2px;color:#a33a2a;font-weight:700}
@media(max-width:760px){.top{align-items:start;flex-direction:column}.auth{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.toolbar{flex-wrap:wrap}}
@media(prefers-color-scheme:dark){:root{background:#121915;color:#eef4ef}.auth,.toolbar,.card{background:#1b2620;border-color:#33463b}input,select,button,textarea{background:#121915;color:#eef4ef;border-color:#405448}.pill{background:#293a31}.sub,.meta,.empty{color:#aebbb3}}
</style></head><body><main class="shell">
<header class="top"><div><div class="eyebrow">BOOKGYEOL SAFETY</div><h1>운영·신고 콘솔</h1><p class="sub">신고 검토, 콘텐츠 숨김, 경고·정지·차단과 감사 기록</p></div><button id="auditBtn">감사 로그 새로고침</button></header>
<section class="auth"><input id="adminId" aria-label="운영자 식별자" placeholder="운영자 ID" value="operator"><input id="adminKey" type="password" aria-label="운영자 API 키" placeholder="ADMIN_API_KEY"><button class="primary" id="saveKey">세션에 연결</button></section>
<div class="toolbar"><select id="status"><option value="open">미처리</option><option value="reviewing">검토 중</option><option value="resolved">조치 완료</option><option value="dismissed">기각</option><option value="all">전체</option></select><button class="primary" id="loadBtn">신고 불러오기</button></div>
<div id="message" class="message" role="status"></div><div class="grid"><section class="panel"><h2>신고 큐</h2><div id="reports" class="list"></div></section><aside class="panel"><h2>최근 감사 로그</h2><div id="audit" class="list audit"></div></aside></div>
</main><script nonce="{{NONCE}}">
const $=id=>document.getElementById(id), state={key:sessionStorage.getItem('bookgyeol.adminKey')||''}; $('adminKey').value=state.key;
function headers(){return {'Content-Type':'application/json','X-Admin-Key':state.key,'X-Admin-ID':$('adminId').value.trim()||'operator'}}
function text(tag,value,cls){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=value;return el}
function message(value){$('message').textContent=value||''}
async function api(path,options={}){const response=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error?.message||'요청에 실패했습니다');return body}
function reportCard(item){const card=text('article','', 'card');const meta=text('div','', 'meta');[item.status,item.reason,item.targetType,item.targetId,item.reporterNickname||item.reporterId,new Date(item.createdAt).toLocaleString()].forEach(v=>meta.append(text('span',v,'pill')));card.append(meta,text('p',item.detail||'상세 내용 없음','detail'));
 const actions=text('div','', 'actions');[['dismiss','기각'],['hide','숨김'],['warn','경고'],['suspend','7일 정지'],['ban','차단']].forEach(([action,label])=>{const button=text('button',label,action==='ban'?'danger':'');button.onclick=()=>resolve(item.id,action);actions.append(button)});card.append(actions);return card}
async function loadReports(){message('');const box=$('reports');box.replaceChildren(text('div','불러오는 중…','empty'));try{const body=await api('/v1/admin/reports?status='+encodeURIComponent($('status').value));box.replaceChildren(...(body.items.length?body.items.map(reportCard):[text('div','해당 신고가 없습니다.','empty')]))}catch(error){box.replaceChildren();message(error.message)}}
async function resolve(id,action){const reason=prompt('조치 사유를 입력하세요.');if(!reason)return;const durationHours=action==='suspend'?168:0;try{await api('/v1/admin/reports/'+id,{method:'PATCH',body:JSON.stringify({action,reason,durationHours})});await Promise.all([loadReports(),loadAudit()])}catch(error){message(error.message)}}
async function loadAudit(){const box=$('audit');try{const body=await api('/v1/admin/moderation/actions?limit=30');box.replaceChildren(...(body.items.length?body.items.map(item=>{const card=text('div','', 'card');card.append(text('strong',item.action+' · '+item.targetType),text('div',item.reason),text('div',item.operatorId+' · '+new Date(item.createdAt).toLocaleString(),'meta'));return card}):[text('div','감사 기록이 없습니다.','empty')]))}catch(error){box.replaceChildren();message(error.message)}}
$('saveKey').onclick=()=>{state.key=$('adminKey').value.trim();sessionStorage.setItem('bookgyeol.adminKey',state.key);message(state.key?'이 브라우저 탭에만 키를 저장했습니다.':'키를 입력해 주세요')};$('loadBtn').onclick=loadReports;$('auditBtn').onclick=loadAudit;
</script></body></html>`
