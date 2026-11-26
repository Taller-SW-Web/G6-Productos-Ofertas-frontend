import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';

// Isolated synthetic boundary only; never claims G7 or provider JWT enforcement.
const key='synthetic-test-key-not-a-credential';
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const sign = (claims, secret=key) => { const body=encode({alg:'HS256',typ:'JWT'})+'.'+encode(claims); return body+'.'+createHmac('sha256',secret).update(body).digest('base64url'); };
const valid={iss:'synthetic-issuer',aud:'synthetic-audience',exp:4102444800,scope:'taxonomy:write',sub:'synthetic-user'};
function authorize(header) {
  try {
    const [a,b,c]=header.replace(/^Bearer /,'').split('.');
    const sig=Buffer.from(c,'base64url'), expected=createHmac('sha256',key).update(a+'.'+b).digest();
    if(sig.length!==expected.length || !timingSafeEqual(sig,expected)) return 401;
    const payload=JSON.parse(Buffer.from(b,'base64url').toString('utf8'));
    if(payload.iss!==valid.iss || payload.aud!==valid.aud || payload.exp<=Math.floor(Date.now()/1000)) return 401;
    if(payload.scope!==valid.scope || payload.client_id==='modulo-ventas') return 403;
    return 202;
  } catch { return 401; }
}
test('synthetic provider rejects expired, wrong signature, issuer, audience, scope and M2M without mutation',async()=>{
  let mutations=0;
  const server=createServer((req,res)=>{ const status=authorize(req.headers.authorization ?? ''); if(status===202) mutations++; res.writeHead(status).end(); });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const address=server.address(); if(!address || typeof address==='string') throw Error('NO_PORT');
  const call=token=>fetch(`http://127.0.0.1:${address.port}/`,{method:'POST',headers:token?{authorization:'Bearer '+token}:{}}).then(r=>r.status);
  try {
    assert.equal(await call(),401);
    for(const token of [sign({...valid,exp:1}),sign(valid,'wrong-key'),sign({...valid,iss:'other'}),sign({...valid,aud:'other'})]) assert.equal(await call(token),401);
    for(const token of [sign({...valid,scope:'read'}),sign({...valid,client_id:'modulo-ventas'})]) assert.equal(await call(token),403);
    assert.equal(mutations,0); assert.equal(await call(sign(valid)),202); assert.equal(mutations,1);
  } finally {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));}
});
