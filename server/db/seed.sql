-- Shared catalog definitions (Global, not owned by any fake user)

INSERT INTO inventory_items(code,name,category,rarity,description,effect,duration)
VALUES
('xp-boost','XP Boost','Boost','Rare','2× XP for 1 hour','Doubles XP earned','1 hour'),
('streak-shield','Streak Shield','Shield','Epic','Protect one missed day','Protects one streak day','1 day'),
('focus-potion','Focus Potion','Boost','Rare','+25% focus XP for one session','25% more focus XP','1 session'),
('mystery-box','Mystery Box','Consumable','Legendary','Random reward','Random RPG reward','Instant'),
('rare-gem','Rare Gem','Collectible','Epic','Exchange for special rewards','Collection item','Permanent'),
('luck-token','Luck Token','Luck','Rare','Improves mystery rewards','Lucky reward modifier','1 use'),
('quest-reroll','Quest Reroll','Quest Item','Uncommon','Reroll a quest','Replaces quest','Instant'),
('coin-boost','Coin Boost','Boost','Rare','1.5× coins for one hour','1.5× coins','1 hour'),
('achievement-token','Achievement Token','Achievement','Epic','Unlock special achievement rewards','Achievement currency','Permanent'),
('event-token','Event Token','Event','Rare','Seasonal event token','Event currency','Event')
ON CONFLICT (code) DO NOTHING;

INSERT INTO rewards(owner_id,name,cost,category,description)
SELECT NULL,v.name,v.cost,v.category,v.description FROM (VALUES
('Coffee Treat',500,'Food','Buy your favorite coffee'),
('1 Hour Gaming',300,'Gaming','A guilt-free gaming hour'),
('Movie Night',800,'Entertainment','Movie + snack'),
('Favorite Meal',1000,'Food','Your reward meal'),
('Weekend Outing',10000,'Travel','Plan a fun outing')) v(name,cost,category,description)
WHERE NOT EXISTS (SELECT 1 FROM rewards WHERE owner_id IS NULL AND name=v.name);

INSERT INTO achievements(code,name,description,reward,unlocked)
VALUES
('first-step','First Step','Complete first quest','50 XP',FALSE),
('consistent','Consistent','Complete 10 quests','250 XP',FALSE),
('iron-will','Iron Will','30-day streak','Epic badge',FALSE),
('warrior','Warrior','100 workouts','Warrior title',FALSE),
('scholar','Scholar','Earn 10,000 Intelligence XP','Scholar title',FALSE),
('millionaire','Millionaire','Earn 100,000 coins','Golden badge',FALSE),
('legendary','Legendary','Reach Level 100','Legendary title',FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO skills(code,name,level,parents)
VALUES
('knowledge','Knowledge',1,'{}'),
('programming','Programming',0,'{knowledge}'),
('reading','Reading',0,'{knowledge}'),
('python','Python',0,'{programming}'),
('web','Web',0,'{programming}'),
('communication','Communication',0,'{knowledge}')
ON CONFLICT (code) DO NOTHING;


