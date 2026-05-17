# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> Skills and Upgrades >> should display skill list from main menu
- Location: e2e/game.spec.ts:165:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/Skills|Drop/i')
Expected: visible
Error: strict mode violation: locator('text=/Skills|Drop/i') resolved to 29 elements:
    1) <h2>Skills & Drop Rates</h2> aka getByRole('heading', { name: 'Skills & Drop Rates' })
    2) <p>Each level-up draw selects 3 random cards. Drop c…</p> aka getByText('Each level-up draw selects 3')
    3) <span>7 skills • 53.5% Tier Chance</span> aka getByText('skills • 53.5% Tier Chance')
    4) <div>Drop Chance: 8.77%</div> aka getByText('Drop Chance: 8.77%').first()
    5) <div>Drop Chance: 8.77%</div> aka getByText('Drop Chance: 8.77%').nth(1)
    6) <div>Drop Chance: 7.02%</div> aka getByText('Drop Chance: 7.02%').first()
    7) <div>Drop Chance: 7.89%</div> aka getByText('Drop Chance: 7.89%').first()
    8) <div>Drop Chance: 7.89%</div> aka getByText('Drop Chance: 7.89%').nth(1)
    9) <div>Drop Chance: 7.02%</div> aka getByText('Drop Chance: 7.02%').nth(1)
    10) <div>Drop Chance: 6.14%</div> aka getByText('Drop Chance: 6.14%')
    ...

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=/Skills|Drop/i')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - heading "Crypto Arena Survivors" [level=1] [ref=e5]
    - generic [ref=e6]:
      - generic "Soft currency" [ref=e7]: 0 coins
      - generic [ref=e8]: Guest LJ7V
  - main [ref=e9]:
    - generic [ref=e11]:
      - heading "Skills & Drop Rates" [level=2] [ref=e12]
      - paragraph [ref=e13]: Each level-up draw selects 3 random cards. Drop chances shown below.
      - generic [ref=e14]:
        - generic [ref=e15]:
          - heading "Common" [level=3] [ref=e16]
          - generic [ref=e17]: 7 skills • 53.5% Tier Chance
        - generic [ref=e18]:
          - generic [ref=e19]:
            - generic [ref=e20]: Sharp Aim
            - generic [ref=e21]: +15% weapon damage.
            - generic [ref=e22]: "Drop Chance: 8.77%"
          - generic [ref=e23]:
            - generic [ref=e24]: Tough Skin
            - generic [ref=e25]: +20 max HP and heal to full.
            - generic [ref=e26]: "Drop Chance: 8.77%"
          - generic [ref=e27]:
            - generic [ref=e28]: Field Medic
            - generic [ref=e29]: +0.5 HP regen / second.
            - generic [ref=e30]: "Drop Chance: 7.02%"
          - generic [ref=e31]:
            - generic [ref=e32]: Light Boots
            - generic [ref=e33]: +10% movement speed.
            - generic [ref=e34]: "Drop Chance: 7.89%"
          - generic [ref=e35]:
            - generic [ref=e36]: Quickdraw
            - generic [ref=e37]: +12% attack speed.
            - generic [ref=e38]: "Drop Chance: 7.89%"
          - generic [ref=e39]:
            - generic [ref=e40]: Magnet
            - generic [ref=e41]: +25% pickup radius.
            - generic [ref=e42]: "Drop Chance: 7.02%"
          - generic [ref=e43]:
            - generic [ref=e44]: Apprentice
            - generic [ref=e45]: +15% XP gain.
            - generic [ref=e46]: "Drop Chance: 6.14%"
      - generic [ref=e47]:
        - generic [ref=e48]:
          - heading "Rare" [level=3] [ref=e49]
          - generic [ref=e50]: 7 skills • 29.8% Tier Chance
        - generic [ref=e51]:
          - generic [ref=e52]:
            - generic [ref=e53]: Eagle Eye
            - generic [ref=e54]: +8% critical strike chance.
            - generic [ref=e55]: "Drop Chance: 5.26%"
          - generic [ref=e56]:
            - generic [ref=e57]: Killer Instinct
            - generic [ref=e58]: +30% critical damage.
            - generic [ref=e59]: "Drop Chance: 5.26%"
          - generic [ref=e60]:
            - generic [ref=e61]: Hardened Plate
            - generic [ref=e62]: +2 armor (flat damage reduction).
            - generic [ref=e63]: "Drop Chance: 5.26%"
          - generic [ref=e64]:
            - generic [ref=e65]: Slippery
            - generic [ref=e66]: +8% dodge chance.
            - generic [ref=e67]: "Drop Chance: 4.39%"
          - generic [ref=e68]:
            - generic [ref=e69]: Four-Leaf
            - generic [ref=e70]: +10% luck (better upgrade rolls).
            - generic [ref=e71]: "Drop Chance: 4.39%"
          - generic [ref=e72]:
            - generic [ref=e73]: Twin Shot
            - generic [ref=e74]: +1 projectile to all weapons.
            - generic [ref=e75]: "Drop Chance: 3.51%"
          - generic [ref=e76]:
            - generic [ref=e77]: Toxic Rounds
            - generic [ref=e78]: Hits apply a damage-over-time poison.
            - generic [ref=e79]: "Drop Chance: 1.75%"
      - generic [ref=e80]:
        - generic [ref=e81]:
          - heading "Epic" [level=3] [ref=e82]
          - generic [ref=e83]: 5 skills • 11.4% Tier Chance
        - generic [ref=e84]:
          - generic [ref=e85]:
            - generic [ref=e86]: Vampiric
            - generic [ref=e87]: +5% lifesteal.
            - generic [ref=e88]: "Drop Chance: 2.63%"
          - generic [ref=e89]:
            - generic [ref=e90]: Annihilator
            - generic [ref=e91]: +30% weapon damage.
            - generic [ref=e92]: "Drop Chance: 2.63%"
          - generic [ref=e93]:
            - generic [ref=e94]: Iron Heart
            - generic [ref=e95]: +50 max HP.
            - generic [ref=e96]: "Drop Chance: 2.63%"
          - generic [ref=e97]:
            - generic [ref=e98]: Explosive Bullets
            - generic [ref=e99]: Projectiles detonate on impact for splash damage.
            - generic [ref=e100]: "Drop Chance: 1.75%"
          - generic [ref=e101]:
            - generic [ref=e102]: Chain Lightning
            - generic [ref=e103]: Hits arc to a nearby enemy for half damage.
            - generic [ref=e104]: "Drop Chance: 1.75%"
      - generic [ref=e105]:
        - generic [ref=e106]:
          - heading "Legendary" [level=3] [ref=e107]
          - generic [ref=e108]: 4 skills • 5.3% Tier Chance
        - generic [ref=e109]:
          - generic [ref=e110]:
            - generic [ref=e111]: Drone Companion
            - generic [ref=e112]: A drone follows you and fires at the nearest enemy.
            - generic [ref=e113]: "Drop Chance: 0.88%"
          - generic [ref=e114]:
            - generic [ref=e115]: Orbiting Magic Orb
            - generic [ref=e116]: A glowing orb circles you, damaging anything it touches.
            - generic [ref=e117]: "Drop Chance: 0.88%"
          - generic [ref=e118]:
            - generic [ref=e119]: Freeze Blast
            - generic [ref=e120]: Freeze all non-boss enemies for 3-5 seconds. Usable once per run.
            - generic [ref=e121]: "Drop Chance: 1.75%"
          - generic [ref=e122]:
            - generic [ref=e123]: Purge Bolt
            - generic [ref=e124]: Instantly kill all non-boss enemies on screen. Usable once per run.
            - generic [ref=e125]: "Drop Chance: 1.75%"
      - button "Back" [ref=e127] [cursor=pointer]
```

# Test source

```ts
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
> 171 |       await expect(page.locator('text=/Skills|Drop/i')).toBeVisible();
      |                                                         ^ Error: expect(locator).toBeVisible() failed
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