async page => {
 const results=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:1423/');
 for(const lang of ['en','zh'])for(const theme of ['light','dark'])for(const width of [900,1440]){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(({lang,theme})=>{localStorage.setItem('i18nextLng',lang);localStorage.setItem('tauri-ui-theme',theme)},{lang,theme});
  await page.goto('http://localhost:1423/?calendar=real');await page.getByRole('button',{name:lang==='en'?'Account':'账户',exact:true}).click();
  const calendar=page.locator('.harbor-contribution-calendar');await calendar.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion')?.dataset.phase==='idle');
  const september=page.locator('[data-contribution-day="2026-09-06"]');
  const august=page.locator('[data-contribution-day="2026-08-02"]');
  await august.click();await page.waitForTimeout(120);
  const facing=await page.locator('.harbor-companion-facing').getAttribute('style');
  if(!facing.includes('scaleX(-1)'))throw Error('leftward facing: '+facing);
  await september.click();await page.waitForFunction(()=>document.querySelector('.harbor-calendar-companion').dataset.phase==='idle');
  const february=page.locator('[data-contribution-day="2026-02-01"]');await february.hover();
  const wanted=await february.getAttribute('aria-label');
  if(!(await page.getByRole('tooltip').textContent()).includes(wanted))throw Error('hover stuck');
  const clearance=await page.evaluate(()=>{
   const cell=document.querySelector('[data-contribution-day="2026-09-06"]'),label=cell.parentElement.firstElementChild;
   const range=document.createRange();range.selectNodeContents(label);
   return document.querySelector('.harbor-companion-position').getBoundingClientRect().top-range.getBoundingClientRect().bottom;
  });
  if(clearance<0)throw Error('month label overlap: '+clearance);
  await page.screenshot({path:`output/playwright/calendar-review/${lang}-${theme}-${width}.png`});
  await page.mouse.move(5,5);await february.focus();
  if(!(await page.getByRole('tooltip').textContent()).includes(wanted))throw Error('focus date');
  await page.keyboard.press('Escape');if(await page.getByRole('tooltip').count())throw Error('Escape tooltip');
  await page.getByRole('button',{name:lang==='en'?'Month':'月份',exact:true}).click();
  await page.locator('[data-contribution-day]').first().click();
  const second=page.locator('[data-contribution-day]').nth(1);await second.hover();
  if(!(await page.getByRole('tooltip').textContent()).includes(await second.getAttribute('aria-label')))throw Error('month hover');
  await page.getByRole('button',{name:lang==='en'?'Pixel companion settings':'像素伙伴设置',exact:true}).click();
  if(await page.getByRole('tooltip').count())throw Error('tooltip covers settings');
  await page.getByRole('button',{name:lang==='en'?'Pause companion':'暂停伙伴',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'reduce'});
  if(await page.locator('.harbor-companion-hero').evaluate(e=>getComputedStyle(e).animationName)!=='none')throw Error('reduced');
  if(await page.locator('.harbor-calendar-companion').getAttribute('data-phase')!=='encounter')throw Error('reduced encounter hidden');
  if(await page.locator('.harbor-companion-object').evaluate(e=>getComputedStyle(e).opacity)!=='1')throw Error('static chest hidden');
  const selected=page.locator('[data-contribution-day][aria-pressed="true"]');
  await page.keyboard.press('Tab');await selected.focus();
  const focus=await selected.evaluate(e=>({visible:e.matches(':focus-visible'),shadow:getComputedStyle(e).boxShadow,ring:getComputedStyle(e).getPropertyValue('--ring')}));
  if(!focus.visible||!focus.shadow.includes('4px'))throw Error('selected focus ring');
  await page.waitForFunction(()=>document.querySelector('.harbor-contribution-calendar').dataset.arriving==='false');
  results.push({lang,theme,width,facing,clearance,hover:true,keyboard:true,menu:true,reduced:true});
 }
 if(errors.length)throw Error(errors.join('\n'));
 return {results,errors};
}
