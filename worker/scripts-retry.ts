#!/usr/bin/env node
const id = process.argv[2], base = process.env.BLACKBOX_URL, token = process.env.BLACKBOX_OPERATOR_TOKEN;
const confirmed = process.argv.includes('--confirm-no-run');
if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !base || !token) {
  console.error('Usage: set BLACKBOX_URL and BLACKBOX_OPERATOR_TOKEN, then pnpm retry <request-uuid> --confirm-no-run');
  process.exit(2);
}
if (!confirmed) {
  console.error('Refusing retry. Inspect GitHub for the request first, then add --confirm-no-run only when no matching run exists.');
  process.exit(2);
}
const url = new URL(base);
if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('HTTPS is required');
url.pathname = `/requests/${id}/retry`;
const result = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({confirmed_no_run:true})});
console.log(await result.text());
if (!result.ok) process.exit(1);
export {};
