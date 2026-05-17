# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> Main Menu Navigation >> should navigate to character select
- Location: e2e/game.spec.ts:27:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Select Your Champion')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=Select Your Champion')

```

```yaml
- banner:
  - heading "Crypto Arena Survivors" [level=1]
  - text: 0 coins Guest VRXX
- main:
  - heading "Select Character" [level=2]
  - 'button "Potato Soldier Sturdy starter with balanced stats and a trusty pistol. HP 100 | SPD 200 | Weapon: pistol"':
    - strong: Potato Soldier
    - paragraph: Sturdy starter with balanced stats and a trusty pistol.
    - text: "HP 100 | SPD 200 | Weapon: pistol"
  - 'button "Robot Cube Coming soon Heavy chassis: more HP, slower feet, big shotgun blasts. HP 140 | SPD 175 | Weapon: shotgun"':
    - strong: Robot Cube Coming soon
    - paragraph: "Heavy chassis: more HP, slower feet, big shotgun blasts."
    - text: "HP 140 | SPD 175 | Weapon: shotgun"
  - 'button "Ninja Cat Coming soon Glass cannon: light, fast, crits hard, dodges often. HP 80 | SPD 240 | Weapon: katana"':
    - strong: Ninja Cat Coming soon
    - paragraph: "Glass cannon: light, fast, crits hard, dodges often."
    - text: "HP 80 | SPD 240 | Weapon: katana"
  - button "Back"
  - button "Continue"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Main Menu Navigation', () => {
  4   |   test('should load main menu with all buttons', async ({ page }) => {
  5   |     await page.goto('/');
  6   |     
  7   |     await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible();
  8   |     await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  9   |     await expect(page.getByRole('button', { name: /character select/i })).toBeVisible();
  10  |     await expect(page.getByRole('button', { name: /how to play/i })).toBeVisible();
  11  |   });
  12  | 
  13  |   test('should toggle language between EN and ID', async ({ page }) => {
  14  |     await page.goto('/');
  15  |     
  16  |     const langBtn = page.getByRole('button', { name: /language/i });
  17  |     await expect(langBtn).toBeVisible();
  18  |     
  19  |     const initialText = await langBtn.textContent();
  20  |     expect(initialText).toMatch(/EN|ID/);
  21  |     
  22  |     await langBtn.click();
  23  |     const newText = await langBtn.textContent();
  24  |     expect(newText).not.toBe(initialText);
  25  |   });
  26  | 
  27  |   test('should navigate to character select', async ({ page }) => {
  28  |     await page.goto('/');
  29  |     
  30  |     await page.getByRole('button', { name: /character select/i }).click();
> 31  |     await expect(page.locator('text=Select Your Champion')).toBeVisible();
      |                                                             ^ Error: expect(locator).toBeVisible() failed
  32  |   });
  33  | 
  34  |   test('should navigate to how to play', async ({ page }) => {
  35  |     await page.goto('/');
  36  |     
  37  |     await page.getByRole('button', { name: /how to play/i }).click();
  38  |     await expect(page.locator('text=How to Play')).toBeVisible();
  39  |   });
  40  | });
  41  | 
  42  | test.describe('Game Flow', () => {
  43  |   test('should complete username → character → playing flow', async ({ page }) => {
  44  |     await page.goto('/');
  45  |     
  46  |     await page.getByRole('button', { name: /play/i }).click();
  47  |     await expect(page.locator('text=ARENA CALLSIGN')).toBeVisible();
  48  |     
  49  |     const usernameInput = page.locator('input[type="text"]').first();
  50  |     await usernameInput.fill('TestPlayer');
  51  |     
  52  |     await page.getByRole('button', { name: /save|deploy/i }).click();
  53  |     
  54  |     await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
  55  |   });
  56  | 
  57  |   test('should display HUD elements during gameplay', async ({ page }) => {
  58  |     await page.goto('/');
  59  |     
  60  |     await page.getByRole('button', { name: /play/i }).click();
  61  |     const usernameInput = page.locator('input[type="text"]').first();
  62  |     await usernameInput.fill('HUDTest');
  63  |     await page.getByRole('button', { name: /save|deploy/i }).click();
  64  |     
  65  |     await page.waitForTimeout(2000);
  66  |     
  67  |     await expect(page.locator('text=/Lv|Level/i')).toBeVisible();
  68  |     await expect(page.locator('text=/HP|Health/i')).toBeVisible();
  69  |     await expect(page.locator('text=/Time/i')).toBeVisible();
  70  |   });
  71  | });
  72  | 
  73  | test.describe('Pause and Resume', () => {
  74  |   test('should pause game with ESC key', async ({ page }) => {
  75  |     await page.goto('/');
  76  |     
  77  |     await page.getByRole('button', { name: /play/i }).click();
  78  |     const usernameInput = page.locator('input[type="text"]').first();
  79  |     await usernameInput.fill('PauseTest');
  80  |     await page.getByRole('button', { name: /save|deploy/i }).click();
  81  |     
  82  |     await page.waitForTimeout(1000);
  83  |     
  84  |     await page.keyboard.press('Escape');
  85  |     await page.waitForTimeout(500);
  86  |     
  87  |     await expect(page.locator('text=Resume')).toBeVisible({ timeout: 3000 });
  88  |   });
  89  | 
  90  |   test('should resume game from pause overlay', async ({ page }) => {
  91  |     await page.goto('/');
  92  |     
  93  |     await page.getByRole('button', { name: /play/i }).click();
  94  |     const usernameInput = page.locator('input[type="text"]').first();
  95  |     await usernameInput.fill('ResumeTest');
  96  |     await page.getByRole('button', { name: /save|deploy/i }).click();
  97  |     
  98  |     await page.waitForTimeout(1000);
  99  |     await page.keyboard.press('Escape');
  100 |     await page.waitForTimeout(500);
  101 |     
  102 |     const resumeBtn = page.getByRole('button', { name: /resume/i });
  103 |     await expect(resumeBtn).toBeVisible();
  104 |     await resumeBtn.click();
  105 |     
  106 |     await expect(page.locator('text=Resume')).not.toBeVisible({ timeout: 2000 });
  107 |   });
  108 | 
  109 |   test('should quit to menu from pause overlay', async ({ page }) => {
  110 |     await page.goto('/');
  111 |     
  112 |     await page.getByRole('button', { name: /play/i }).click();
  113 |     const usernameInput = page.locator('input[type="text"]').first();
  114 |     await usernameInput.fill('QuitTest');
  115 |     await page.getByRole('button', { name: /save|deploy/i }).click();
  116 |     
  117 |     await page.waitForTimeout(1000);
  118 |     await page.keyboard.press('Escape');
  119 |     await page.waitForTimeout(500);
  120 |     
  121 |     const quitBtn = page.getByRole('button', { name: /quit|menu/i });
  122 |     await expect(quitBtn).toBeVisible();
  123 |     await quitBtn.click();
  124 |     
  125 |     await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible({ timeout: 2000 });
  126 |   });
  127 | });
  128 | 
  129 | test.describe('Leaderboard', () => {
  130 |   test('should navigate to leaderboard from main menu', async ({ page }) => {
  131 |     await page.goto('/');
```