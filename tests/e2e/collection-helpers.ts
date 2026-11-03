import {expect,type Page} from '@playwright/test';
import {skinById} from '../../packages/shared/src/skins.js';

/** Opens the collection (C) on the card of `skin`, a skin's id; leaves the window open. */
export async function showCard(page:Page,skin:string):Promise<void> {
  // The window's class comes at once; its contents when the wardrobe answers.
  if(!await page.locator('.collection-modal').isVisible())await page.keyboard.press('c');
  await expect(page.locator('#collection')).toBeVisible({timeout:20_000});
  const base=skinById(skin)!.base;
  const character=page.locator(`.cl-hand-card[data-base="${base}"]`);
  await expect(character).toBeVisible();
  if(await character.getAttribute('aria-selected')!=='true')await character.click();
  await expect(character).toHaveAttribute('aria-selected','true');
  const variant=page.locator(`[data-cl="variant"][data-id="${skin}"]`);
  if(await variant.getAttribute('aria-pressed')!=='true')await variant.click();
  await expect(variant).toHaveAttribute('aria-pressed','true');
  await expect(page.locator(`.sc-big[data-skin="${skin}"]`)).toBeVisible();
}
/** The card on show, bought if it has to be: two clicks, then the reveal, kept without wearing it. */
export async function buyCard(page:Page,skin:string):Promise<void> {
  await showCard(page,skin);
  const buy=page.locator('.cl-buy [data-cl="buy"]');
  if(!await buy.isVisible())return;
  await buy.click();await page.locator('.cl-buy [data-cl="buy-confirm"]').click();
  const keep=page.locator('[data-reveal="keep"]');await expect(keep).toBeVisible({timeout:15_000});
  await expect(page.locator('.cl-reveal.landed')).toBeVisible({timeout:15_000});
  await keep.click();await expect(page.locator('.cl-reveal')).toHaveCount(0);
}
/** Buys a skill on the card of `skin`, and closes the window. */
export async function buySkill(page:Page,skin:string,skill:string):Promise<void> {
  await showCard(page,skin);
  await page.locator(`[data-skill="${skill}"] [data-cl="skill-buy"]`).click();
  await page.locator(`[data-skill="${skill}"] [data-cl="skill-confirm"]`).click();
  await expect(page.locator(`[data-skill="${skill}"]`)).toContainText('Liberada',{timeout:15_000});
  await page.keyboard.press('c');await expect(page.locator('#collection')).toBeHidden();
}
/** Puts on a skin through the collection, buying it first if needed, and closes the window. */
export async function wearCard(page:Page,skin:string):Promise<void> {
  await buyCard(page,skin);
  const wear=page.locator('.cl-buy [data-cl="equip"]');
  if(await wear.isVisible())await wear.click();
  await expect(page.locator('.cl-buy .cl-cta')).toHaveText(/Vestindo/,{timeout:15_000});
  await page.keyboard.press('c');await expect(page.locator('#collection')).toBeHidden();
}
