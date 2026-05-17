# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> Main Menu Navigation >> should toggle language between EN and ID
- Location: e2e/game.spec.ts:13:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.textContent: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /language/i })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - heading "Crypto Arena Survivors" [level=1] [ref=e5]
    - generic [ref=e6]:
      - generic "Soft currency" [ref=e7]: 0 coins
      - generic [ref=e8]: Guest 0U3Y
  - main [ref=e9]:
    - generic [ref=e10]:
      - generic:
        - generic: WARDEN
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: KRIPTO
        - generic [ref=e16]: Arena Survivors
      - paragraph [ref=e17]: Prototipe Fase 1 • potato-soldier
      - generic [ref=e18]:
        - button "Play" [ref=e19] [cursor=pointer]: Main
        - button "Pilih Karakter" [ref=e20] [cursor=pointer]
        - button "Cara Bermain" [ref=e21] [cursor=pointer]
        - button "Skill & Peluang" [ref=e22] [cursor=pointer]
        - button "Bestiary Bos" [ref=e23] [cursor=pointer]
        - button "Papan Skor" [ref=e24] [cursor=pointer]
        - 'button "Bahasa: ID" [active] [ref=e25] [cursor=pointer]'
        - button "Hubungkan Dompet (stub)" [ref=e26] [cursor=pointer]
      - paragraph [ref=e27]: "Tekan backtick (`) dalam game untuk panel dev"
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
> 23  |     const newText = await langBtn.textContent();
      |                                   ^ Error: locator.textContent: Test timeout of 30000ms exceeded.
  24  |     expect(newText).not.toBe(initialText);
  25  |   });
  26  | 
  27  |   test('should navigate to character select', async ({ page }) => {
  28  |     await page.goto('/');
  29  |     
  30  |     await page.getByRole('button', { name: /character select/i }).click();
  31  |     await expect(page.locator('text=Select Your Champion')).toBeVisible();
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
```