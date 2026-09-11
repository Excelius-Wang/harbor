async page => {
 const results=[];
 for(const state of ['loading','error','empty','stale']){
  await page.goto(`http://localhost:1423/?state=${state}&commands=github_list_profile_connections`);
  await page.getByRole('button',{name:'账户',exact:true}).click();
  await page.getByRole('button',{name:'3 关注者',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  if(state==='error')await dialog.getByText('Repolane 暂时无法读取关注列表',{exact:true}).waitFor();
  if(state==='empty')await dialog.getByText('这个用户还没有关注者。',{exact:true}).waitFor();
  if(state==='loading')await dialog.locator('[data-slot=skeleton]').first().waitFor();
  if(state==='stale'){
   await dialog.getByRole('button',{name:/alex-morgan/}).waitFor();
   await page.keyboard.press('Escape');await page.getByRole('button',{name:'刷新',exact:true}).click();
   await page.getByRole('button',{name:'3 关注者',exact:true}).click();
   await dialog.getByText('Preview request failed. Retry to check error feedback.',{exact:true}).waitFor();
  }
  await page.screenshot({path:`output/playwright/profile-layout/connections-${state}.png`});
  await page.keyboard.press('Escape');
  results.push({state,passed:true});
 }
 return results;
}
