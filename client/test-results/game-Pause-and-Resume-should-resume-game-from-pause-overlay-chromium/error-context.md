# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> Pause and Resume >> should resume game from pause overlay
- Location: e2e/game.spec.ts:90:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: /play/i }) resolved to 2 elements:
    1) <button aria-label="Play" class="cas-play-btn">Play</button> aka getByRole('button', { name: 'Play', exact: true })
    2) <button>How to Play</button> aka getByRole('button', { name: 'How to Play' })

Call log:
  - waiting for getByRole('button', { name: /play/i })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - heading "Crypto Arena Survivors" [level=1] [ref=e5]
    - generic [ref=e6]:
      - generic "Soft currency" [ref=e7]: 0 coins
      - generic [ref=e8]: Guest TMON
  - main [ref=e9]:
    - generic [ref=e10]:
      - generic:
        - generic: WARDEN
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]: CRYPTO
        - generic [ref=e28]: Arena Survivors
      - paragraph [ref=e29]: Phase 1 prototype • potato-soldier
      - generic [ref=e30]:
        - button "Play" [ref=e31] [cursor=pointer]
        - button "Character Select" [ref=e32] [cursor=pointer]
        - button "How to Play" [ref=e33] [cursor=pointer]
        - button "Skills & Drop Rates" [ref=e34] [cursor=pointer]
        - button "Boss Bestiary" [ref=e35] [cursor=pointer]
        - button "Leaderboard" [ref=e36] [cursor=pointer]
        - 'button "Language: EN" [ref=e37] [cursor=pointer]'
        - button "Connect Wallet (stub)" [ref=e38] [cursor=pointer]
      - paragraph [ref=e39]: "Press backtick (`) in-game for dev panel"
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
> 93  |     await page.getByRole('button', { name: /play/i }).click();
      |                                                       ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: /play/i }) resolved to 2 elements:
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
  132 |     
  133 |     const leaderboardBtn = page.getByRole('button', { name: /leaderboard/i });
  134 |     if (await leaderboardBtn.isVisible()) {
  135 |       await leaderboardBtn.click();
  136 |       await expect(page.locator('text=Leaderboard')).toBeVisible();
  137 |     }
  138 |   });
  139 | 
  140 |   test('should display leaderboard columns', async ({ page }) => {
  141 |     await page.goto('/');
  142 |     
  143 |     const leaderboardBtn = page.getByRole('button', { name: /leaderboard/i });
  144 |     if (await leaderboardBtn.isVisible()) {
  145 |       await leaderboardBtn.click();
  146 |       
  147 |       await expect(page.locator('text=/Rank|Player|Bosses|Level|Time/i')).toBeVisible();
  148 |     }
  149 |   });
  150 | });
  151 | 
  152 | test.describe('Boss Bestiary', () => {
  153 |   test('should navigate to boss bestiary from main menu', async ({ page }) => {
  154 |     await page.goto('/');
  155 |     
  156 |     const bestiaryBtn = page.getByRole('button', { name: /bestiary|boss/i });
  157 |     if (await bestiaryBtn.isVisible()) {
  158 |       await bestiaryBtn.click();
  159 |       await expect(page.locator('text=/Boss|Bestiary/i')).toBeVisible();
  160 |     }
  161 |   });
  162 | });
  163 | 
  164 | test.describe('Skills and Upgrades', () => {
  165 |   test('should display skill list from main menu', async ({ page }) => {
  166 |     await page.goto('/');
  167 |     
  168 |     const skillsBtn = page.getByRole('button', { name: /skills|drop/i });
  169 |     if (await skillsBtn.isVisible()) {
  170 |       await skillsBtn.click();
  171 |       await expect(page.locator('text=/Skills|Drop/i')).toBeVisible();
  172 |     }
  173 |   });
  174 | });
  175 | 
  176 | test.describe('Responsive Design', () => {
  177 |   test('should render on mobile viewport', async ({ page }) => {
  178 |     await page.setViewportSize({ width: 375, height: 667 });
  179 |     await page.goto('/');
  180 |     
  181 |     await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible();
  182 |     await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  183 |   });
  184 | 
  185 |   test('should render on tablet viewport', async ({ page }) => {
  186 |     await page.setViewportSize({ width: 768, height: 1024 });
  187 |     await page.goto('/');
  188 |     
  189 |     await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible();
  190 |     await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  191 |   });
  192 | 
  193 |   test('should render on desktop viewport', async ({ page }) => {
```