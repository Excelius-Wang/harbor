async page => {
 const results=[];
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setViewportSize({width:900,height:620});
 for(const state of ['loading','empty','error','stale']){
  await page.goto(`http://localhost:1423/?calendar=real&profile=no-readme&state=${state}&commands=github_get_user_contributions`);
  await page.getByRole('button',{name:'账户',exact:true}).click();
  await page.getByRole('heading',{name:'Harbor Preview',exact:true}).waitFor();
  if(state==='loading')await page.locator('[data-slot=skeleton]').first().waitFor();
  if(state==='error')await page.getByText('Repolane 暂时无法读取贡献记录',{exact:true}).waitFor();
  if(state==='empty')await page.getByText('过去一年有 0 次贡献',{exact:true}).waitFor();
  if(state==='stale'){
   await page.getByRole('button',{name:'月份',exact:true}).click();
   await page.getByRole('button',{name:'上个月',exact:true}).click();
   await page.getByRole('button',{name:'刷新',exact:true}).click();
   await page.getByText('Preview request failed. Retry to check error feedback.',{exact:true}).waitFor();
   if(!await page.getByText('2026年8月',{exact:true}).count())throw Error('lost month on failed refresh');
  }
  await page.screenshot({path:`output/playwright/profile-feedback/state-${state}.png`});
  results.push({state,passed:true});
 }
 for(const theme of ['light','dark'])for(const background of ['cool','neutral','bright']){
  await page.evaluate(theme=>localStorage.setItem('tauri-ui-theme',theme),theme);
  await page.goto(`http://localhost:1423/?calendar=real&profile=no-readme&background=${background}`);
  await page.getByRole('button',{name:'账户',exact:true}).click();
  const root=page.locator('.harbor-contribution-calendar');await root.waitFor();await root.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const el=document.querySelector('.harbor-contribution-calendar');return el.dataset.entered==='true'&&!el.getAnimations({subtree:true}).some(a=>a.playState==='running')});
  await page.screenshot({path:`output/playwright/profile-feedback/${theme}-${background}.png`});
 }
 return results;
}
