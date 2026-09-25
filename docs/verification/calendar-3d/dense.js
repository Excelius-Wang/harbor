async (page) => {
 const results=[];
 for(const [theme,width] of [['dark',1440],['light',900]]) {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width,height:1000});
  await page.evaluate(theme=>{localStorage.setItem('i18nextLng','zh');localStorage.setItem('tauri-ui-theme',theme)},theme);
  await page.goto('http://localhost:1439/ui-components?view=opportunities&links=record');
  await page.getByRole('button',{name:'账户',exact:true}).click();
  await page.locator('[data-contribution-day]').last().locator('.harbor-contribution-top').click();
  await page.mouse.move(5,5);
  await page.waitForFunction(()=>document.querySelector('.harbor-companion-position')?.getAnimations().every(a=>a.playState==='finished'||a.playState==='idle'));
  if(await page.getByRole('tooltip').count()) throw Error('Sticky tooltip');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Overflow');
  await page.screenshot({path:`output/playwright/calendar-3d/rooftop-dense-${theme}-${width}.png`});
  const last=page.locator('[data-contribution-day]').last();
  await last.focus(); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  if(await page.locator('[data-contribution-day][aria-pressed="true"]').getAttribute('data-contribution-day')!==await page.locator('[data-contribution-day]').first().getAttribute('data-contribution-day')) throw Error('Hidden day keyboard access');
  results.push({theme,width,dense:true,keyboard:true});
 }
 return results;
}
