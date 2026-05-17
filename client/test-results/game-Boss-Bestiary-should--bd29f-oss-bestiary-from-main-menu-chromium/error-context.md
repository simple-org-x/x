# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> Boss Bestiary >> should navigate to boss bestiary from main menu
- Location: e2e/game.spec.ts:153:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/Boss|Bestiary/i')
Expected: visible
Error: strict mode violation: locator('text=/Boss|Bestiary/i') resolved to 6 elements:
    1) <h2>Boss Bestiary</h2> aka getByRole('heading', { name: 'Boss Bestiary' })
    2) <p>Bosses spawn every 10 player levels (Lv 10, 20, 3…</p> aka getByText('Bosses spawn every 10 player')
    3) <summary>HP scaling preview (when this boss type appears)</summary> aka getByRole('group').filter({ hasText: 'HP scaling preview (when this boss type appears)#1 HP: 1,500 • Dmg: 25#5 HP: 5,' }).locator('summary')
    4) <summary>HP scaling preview (when this boss type appears)</summary> aka getByRole('group').filter({ hasText: 'HP scaling preview (when this boss type appears)#2 HP: 2,400 • Dmg: 32#6 HP: 6,' }).locator('summary')
    5) <summary>HP scaling preview (when this boss type appears)</summary> aka getByRole('group').filter({ hasText: 'HP scaling preview (when this boss type appears)#3 HP: 3,300 • Dmg: 40#7 HP: 6,' }).locator('summary')
    6) <summary>HP scaling preview (when this boss type appears)</summary> aka getByRole('group').filter({ hasText: 'HP scaling preview (when this boss type appears)#4 HP: 4,200 • Dmg: 47#8 HP: 7,' }).locator('summary')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=/Boss|Bestiary/i')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - heading "Crypto Arena Survivors" [level=1] [ref=e5]
    - generic [ref=e6]:
      - generic "Soft currency" [ref=e7]: 0 coins
      - generic [ref=e8]: Guest 502C
  - main [ref=e9]:
    - generic [ref=e11]:
      - generic [ref=e12]:
        - heading "Boss Bestiary" [level=2] [ref=e13]
        - button "← Back" [ref=e14] [cursor=pointer]
      - paragraph [ref=e15]: Bosses spawn every 10 player levels (Lv 10, 20, 30…). The roster cycles through these four archetypes; each subsequent encounter is significantly stronger.
      - generic [ref=e16]:
        - generic [ref=e17]:
          - generic [ref=e18]:
            - heading "The Warden" [level=3] [ref=e20]
            - generic [ref=e21]: warden
          - generic [ref=e22]:
            - generic [ref=e23]:
              - generic [ref=e24]: Base HP
              - generic [ref=e25]: 1,500
            - generic [ref=e26]:
              - generic [ref=e27]: Contact Dmg
              - generic [ref=e28]: "25"
            - generic [ref=e29]:
              - generic [ref=e30]: Speed
              - generic [ref=e31]: "60"
            - generic [ref=e32]:
              - generic [ref=e33]: XP Drop
              - generic [ref=e34]: "100"
            - generic [ref=e35]:
              - generic [ref=e36]: Coin Drop
              - generic [ref=e37]: "50"
          - generic [ref=e38]: "Skills:"
          - generic [ref=e39]:
            - generic [ref=e40]:
              - generic [ref=e41]: ◎
              - generic [ref=e42]:
                - strong [ref=e43]: AOE Telegraph
                - generic [ref=e44]: — Marks a 140px radius zone for 1.2s, then detonates for 25 dmg.
            - generic [ref=e45]:
              - generic [ref=e46]: ✦
              - generic [ref=e47]:
                - strong [ref=e48]: Bullet Ring
                - generic [ref=e49]: — Fires 16 bullets outward @ 220 speed, 12 dmg each.
            - generic [ref=e50]:
              - generic [ref=e51]: ➤
              - generic [ref=e52]:
                - strong [ref=e53]: Dash Enraged
                - generic [ref=e54]: — Below 50% HP, charges at player @ 260 speed for 0.7s.
          - group [ref=e55]:
            - generic "HP scaling preview (when this boss type appears)" [ref=e56] [cursor=pointer]
        - generic [ref=e57]:
          - generic [ref=e58]:
            - heading "Crimson Reaver" [level=3] [ref=e60]
            - generic [ref=e61]: crimson-reaver
          - generic [ref=e62]:
            - generic [ref=e63]:
              - generic [ref=e64]: Base HP
              - generic [ref=e65]: 1,500
            - generic [ref=e66]:
              - generic [ref=e67]: Contact Dmg
              - generic [ref=e68]: "25"
            - generic [ref=e69]:
              - generic [ref=e70]: Speed
              - generic [ref=e71]: "60"
            - generic [ref=e72]:
              - generic [ref=e73]: XP Drop
              - generic [ref=e74]: "100"
            - generic [ref=e75]:
              - generic [ref=e76]: Coin Drop
              - generic [ref=e77]: "50"
          - generic [ref=e78]: "Skills:"
          - generic [ref=e79]:
            - generic [ref=e80]:
              - generic [ref=e81]: ◎
              - generic [ref=e82]:
                - strong [ref=e83]: AOE Telegraph
                - generic [ref=e84]: — Marks a 140px radius zone for 1.2s, then detonates for 25 dmg.
            - generic [ref=e85]:
              - generic [ref=e86]: ✦
              - generic [ref=e87]:
                - strong [ref=e88]: Bullet Ring
                - generic [ref=e89]: — Fires 20 bullets outward @ 260 speed, 12 dmg each.
            - generic [ref=e90]:
              - generic [ref=e91]: ➤
              - generic [ref=e92]:
                - strong [ref=e93]: Dash Enraged
                - generic [ref=e94]: — Below 50% HP, charges at player @ 260 speed for 0.7s.
          - group [ref=e95]:
            - generic "HP scaling preview (when this boss type appears)" [ref=e96] [cursor=pointer]
        - generic [ref=e97]:
          - generic [ref=e98]:
            - heading "Void Monarch" [level=3] [ref=e100]
            - generic [ref=e101]: void-monarch
          - generic [ref=e102]:
            - generic [ref=e103]:
              - generic [ref=e104]: Base HP
              - generic [ref=e105]: 1,500
            - generic [ref=e106]:
              - generic [ref=e107]: Contact Dmg
              - generic [ref=e108]: "25"
            - generic [ref=e109]:
              - generic [ref=e110]: Speed
              - generic [ref=e111]: "60"
            - generic [ref=e112]:
              - generic [ref=e113]: XP Drop
              - generic [ref=e114]: "100"
            - generic [ref=e115]:
              - generic [ref=e116]: Coin Drop
              - generic [ref=e117]: "50"
          - generic [ref=e118]: "Skills:"
          - generic [ref=e119]:
            - generic [ref=e120]:
              - generic [ref=e121]: ◎
              - generic [ref=e122]:
                - strong [ref=e123]: AOE Telegraph
                - generic [ref=e124]: — Marks a 180px radius zone for 1.2s, then detonates for 25 dmg.
            - generic [ref=e125]:
              - generic [ref=e126]: ✦
              - generic [ref=e127]:
                - strong [ref=e128]: Bullet Ring
                - generic [ref=e129]: — Fires 24 bullets outward @ 220 speed, 12 dmg each.
            - generic [ref=e130]:
              - generic [ref=e131]: ➤
              - generic [ref=e132]:
                - strong [ref=e133]: Dash Enraged
                - generic [ref=e134]: — Below 50% HP, charges at player @ 540 speed for 0.7s.
          - group [ref=e135]:
            - generic "HP scaling preview (when this boss type appears)" [ref=e136] [cursor=pointer]
        - generic [ref=e137]:
          - generic [ref=e138]:
            - heading "Storm Titan" [level=3] [ref=e140]
            - generic [ref=e141]: storm-titan
          - generic [ref=e142]:
            - generic [ref=e143]:
              - generic [ref=e144]: Base HP
              - generic [ref=e145]: 1,500
            - generic [ref=e146]:
              - generic [ref=e147]: Contact Dmg
              - generic [ref=e148]: "25"
            - generic [ref=e149]:
              - generic [ref=e150]: Speed
              - generic [ref=e151]: "60"
            - generic [ref=e152]:
              - generic [ref=e153]: XP Drop
              - generic [ref=e154]: "100"
            - generic [ref=e155]:
              - generic [ref=e156]: Coin Drop
              - generic [ref=e157]: "50"
          - generic [ref=e158]: "Skills:"
          - generic [ref=e159]:
            - generic [ref=e160]:
              - generic [ref=e161]: ◎
              - generic [ref=e162]:
                - strong [ref=e163]: AOE Telegraph
                - generic [ref=e164]: — Marks a 200px radius zone for 1.2s, then detonates for 25 dmg.
            - generic [ref=e165]:
              - generic [ref=e166]: ✦
              - generic [ref=e167]:
                - strong [ref=e168]: Bullet Ring
                - generic [ref=e169]: — Fires 28 bullets outward @ 300 speed, 12 dmg each.
            - generic [ref=e170]:
              - generic [ref=e171]: ➤
              - generic [ref=e172]:
                - strong [ref=e173]: Dash Enraged
                - generic [ref=e174]: — Below 50% HP, charges at player @ 260 speed for 0.7s.
          - group [ref=e175]:
            - generic "HP scaling preview (when this boss type appears)" [ref=e176] [cursor=pointer]
      - strong [ref=e178]: HP scales by +60% per encounter
```

# Test source

```ts
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
> 159 |       await expect(page.locator('text=/Boss|Bestiary/i')).toBeVisible();
      |                                                           ^ Error: expect(locator).toBeVisible() failed
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