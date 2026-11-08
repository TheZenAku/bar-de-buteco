import {expect,type Locator,type Page} from '@playwright/test';

/** The label over someone's head, found by the name in it (the level badge beside it has its own number). */
export const nameLabel=(page:Page,name:string|RegExp,extra=''):Locator=>page.locator(`.world-label${extra}`).filter({has:page.locator('.label-name',{hasText:name})});
/** Names are hidden until Z, which shows them for a few seconds (docs/sistemas/niveis.md): press it until the one wanted shows. */
export async function seeName(page:Page,label:Locator,timeout=30000):Promise<void> {
  await expect(async()=>{await page.keyboard.press('z');await expect(label).toBeVisible({timeout:1500});}).toPass({timeout});
}
