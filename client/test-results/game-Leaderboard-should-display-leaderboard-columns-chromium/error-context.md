# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> Leaderboard >> should display leaderboard columns
- Location: e2e/game.spec.ts:140:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/Rank|Player|Bosses|Level|Time/i')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=/Rank|Player|Bosses|Level|Time/i')

```

```yaml
- banner:
  - heading "Crypto Arena Survivors" [level=1]
  - text: 0 coins Guest 5UJV
- main:
  - heading "Leaderboard" [level=2]
  - paragraph: No records yet. Play to set a score!
  - button "Back"
```

# Test source

```ts
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
> 147 |       await expect(page.locator('text=/Rank|Player|Bosses|Level|Time/i')).toBeVisible();
      |                                                                           ^ Error: expect(locator).toBeVisible() failed
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
  194 |     await page.setViewportSize({ width: 1920, height: 1080 });
  195 |     await page.goto('/');
  196 |     
  197 |     await expect(page.locator('text=Crypto Arena Survivors')).toBeVisible();
  198 |     await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  199 |   });
  200 | });
  201 | 
```