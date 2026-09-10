async page => {
 await page.setViewportSize({width:900,height:620});
 await page.goto('http://localhost:1423/');
 await page.getByRole('button',{name:/^(Repositories|仓库)$/}).click();
 const list=page.locator('[data-slot="repository-tab-strip"]').getByRole('tablist');await list.waitFor();
 await list.getByRole('tab',{name:/^(Settings|设置)$/}).waitFor();
 const size=await list.evaluate(el=>{const box=el.parentElement;return {height:box.clientHeight,scrollHeight:box.scrollHeight}});
 if(size.scrollHeight>size.height)throw Error('Vertical tab overflow: '+JSON.stringify(size));
 const last=list.getByRole('tab').last();await list.getByRole('tab').first().focus();await page.keyboard.press('End');
 await page.waitForFunction(()=>document.querySelector('[data-slot=repository-tab-strip] [role=tab]:last-child')?.getAttribute('data-state')==='active');
 const visible=await last.evaluate(el=>{const b=el.getBoundingClientRect(),p=el.parentElement.parentElement.getBoundingClientRect();return b.left>=p.left-1&&b.right<=p.right+1});
 if(!visible)throw Error('Last keyboard-selected tab clipped');
 return {passed:true,size};
}
