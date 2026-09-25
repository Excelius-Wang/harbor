async page => {
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:900,height:1000});
 await page.evaluate(()=>{localStorage.setItem('i18nextLng','zh');localStorage.setItem('tauri-ui-theme','dark')});
 await page.goto('http://localhost:1439/ui-components?view=opportunities&calendar=real');
 await page.getByRole('button',{name:'账户',exact:true}).click();
 const marker=page.locator('.harbor-companion-position');
 const settled=()=>page.waitForFunction(()=>document.querySelector('.harbor-companion-position')?.getAnimations().every(a=>a.playState==='finished'||a.playState==='idle'));
 const target=page.locator('[data-contribution-day][data-level="4"]').last();
 await target.locator('.harbor-contribution-top').click(); await settled();
 await target.focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
 if(await marker.getAttribute('data-travel')!=='hop')throw Error('Expected adjacent hop');
 const hop=await marker.evaluate(e=>e.getAnimations()[0].effect.getKeyframes().map(f=>f.transform));
 await page.keyboard.press('Home');await page.keyboard.press('Enter');
 if(await marker.getAttribute('data-travel')!=='fade')throw Error('Expected distant fade');
 await page.keyboard.press('End');await page.keyboard.press('Enter');
 if(await marker.evaluate(e=>e.getAnimations().filter(a=>a.playState==='running').length)>1)throw Error('Queued old movement');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.active==='false');
 await page.waitForFunction(()=>document.querySelector('.harbor-companion-position').getAnimations().every(a=>!a.pending && (a.playState==='paused'||a.playState==='finished')));
 const paused=await marker.evaluate(e=>e.getAnimations().map(a=>a.currentTime));
 await page.waitForTimeout(220);
 const after=await marker.evaluate(e=>e.getAnimations().map(a=>a.currentTime));
 if(JSON.stringify(paused)!==JSON.stringify(after))throw Error('Hidden movement did not pause');
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});await settled();
 const aligned=async()=>marker.evaluate(e=>{
  const r=e.getBoundingClientRect(),face=document.querySelector('[aria-pressed="true"][data-contribution-day] .harbor-contribution-top').getBoundingClientRect();
  const shadow=e.querySelector('.harbor-companion-contact').getBoundingClientRect();
  return {x:Math.abs(r.left+r.width/2-face.left-face.width/2),y:Math.abs(r.top+r.height*.98-face.top-face.height/2),shadowX:Math.abs(shadow.left+shadow.width/2-face.left-face.width/2),shadowY:Math.abs(shadow.top+shadow.height/2-face.top-face.height/2)};
 });
 const landing=await aligned();if(Object.values(landing).some(n=>n>1))throw Error(JSON.stringify(landing));
 await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(60);
 const resize=await aligned();if(Object.values(resize).some(n=>n>1))throw Error('Resize');
 await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Home');await page.keyboard.press('Enter');
 if(await marker.evaluate(e=>e.getAnimations().some(a=>a.playState==='running')))throw Error('Reduced motion');
 const reduced=await aligned();if(Object.values(reduced).some(n=>n>1))throw Error('Reduced contact');
 return {hop,rapidReplacement:true,hiddenPause:true,landing,resize,reduced};
}
