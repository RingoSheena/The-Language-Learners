export const DIFFICULTIES = [
  { id: 'beginner', label: 'Beginner', description: 'Everyday words and set phrases. Start here if you are new to Japanese.' },
  { id: 'intermediate', label: 'Intermediate', description: 'Practical vocabulary for real situations, with more kanji and less hand-holding.' },
  { id: 'expert', label: 'Expert', description: 'Formal, nuanced, and culturally specific terms for advanced learners.' },
]

export const CATEGORIES = [
  { id: 'conversation', label: 'Conversation', description: 'Greetings, small talk, and the phrases that keep a chat going.' },
  { id: 'dining', label: 'Dining', description: 'Ordering, paying, and talking about food in restaurants and at home.' },
  { id: 'travel', label: 'Travel', description: 'Getting around, finding lodging, and handling trips from airport to hotel.' },
]

const DECK_DESCRIPTIONS = {
  'conversation-beginner': 'Greetings, pronouns, feelings, and the most common everyday verbs and adjectives.',
  'conversation-intermediate': 'Talk about work, hobbies, plans, opinions, and emotions with friends and coworkers.',
  'conversation-expert': 'Social nuance: honne vs. tatemae, politeness, debate, and reading between the lines.',
  'dining-beginner': 'Basic foods, drinks, utensils, and meals, plus the phrase said before eating.',
  'dining-intermediate': 'Reservations, ordering, flavors, cooking methods, and popular Japanese dishes.',
  'dining-expert': 'Kaiseki, seasonality, fermentation, sake, and the vocabulary of fine dining.',
  'travel-beginner': 'Transport, directions, places, and must-know words for getting around.',
  'travel-intermediate': 'Trains, tickets, sightseeing, and planning independent trips.',
  'travel-expert': 'Customs, ryokan stays, cancellations, and advanced travel situations.',
}

// Words only. Readings and definitions come from the dictionary at study time.
// Words missing from the dictionary are skipped, so a deck can end up slightly under 50.
const WORDS = {
  'conversation-beginner': [
    'こんにちは', 'こんばんは', 'おはよう', 'ありがとう', 'すみません', 'ごめん', 'はい', 'いいえ', 'さようなら', 'お願い',
    '名前', '友達', '先生', '学生', '私', 'あなた', '彼', '彼女', '今日', '明日',
    '昨日', '今', '好き', '嫌い', '大丈夫', '分かる', '知る', '言う', '話す', '聞く',
    '見る', '行く', '来る', '食べる', '飲む', '大きい', '小さい', '新しい', '古い', '良い',
    '悪い', '楽しい', '嬉しい', '悲しい', '家族', '母', '父', '子供', '日本', '英語',
  ],
  'conversation-intermediate': [
    '久しぶり', '元気', '趣味', '仕事', '忙しい', '残念', '意見', '賛成', '反対', '約束',
    '相談', '説明', '質問', '答え', '理由', '問題', '心配', '安心', '緊張', '興味',
    '経験', '将来', '夢', '目標', '努力', '成功', '失敗', '失礼', '迷惑', '感謝',
    '謝る', '褒める', '怒る', '笑う', '泣く', '驚く', '困る', '悩む', '決める', '考える',
    '思う', '信じる', '伝える', '誘う', '断る', '招待', '紹介', '挨拶', '返事', '連絡',
  ],
  'conversation-expert': [
    '遠慮', '建前', '本音', '曖昧', '配慮', '謙遜', '皮肉', '空気', '気配り', '思いやり',
    '礼儀', '敬語', '丁寧', '恐縮', '気遣い', '察する', '遠回し', '率直', '誠実', '謙虚',
    '傲慢', '偏見', '先入観', '矛盾', '妥協', '譲歩', '主張', '反論', '論争', '議論',
    '説得', '納得', '了解', '承知', '同意', '否定', '肯定', '忠告', '助言', '批判',
    '非難', '弁解', '言い訳', '愚痴', '噂', '冗談', '本心', '誤解', '余計', '無礼',
  ],
  'dining-beginner': [
    '水', 'お茶', 'ご飯', '肉', '魚', '野菜', 'いただきます', 'おいしい', '牛乳', 'コーヒー',
    'ビール', '酒', '果物', 'りんご', 'みかん', 'バナナ', '卵', 'パン', '米', '豚肉',
    '牛肉', '鶏肉', '寿司', '刺身', '天ぷら', 'ラーメン', 'うどん', 'そば', 'カレー', 'サラダ',
    'スープ', '塩', '砂糖', '醤油', '味噌', '朝ご飯', '昼ご飯', '晩ご飯', '食事', '料理',
    '飲み物', '食べ物', 'レストラン', 'メニュー', '皿', 'コップ', 'スプーン', 'フォーク', 'ナイフ', '冷たい',
  ],
  'dining-intermediate': [
    '予約', '注文', '会計', '辛い', '甘い', '箸', '定食', '苦手', '酸っぱい', '苦い',
    '塩辛い', '薄い', '濃い', '柔らかい', '硬い', '熱い', '温かい', '満腹', '空腹', 'お腹',
    '喉', '食欲', '味', '香り', '調味料', '材料', '具', '焼く', '煮る', '炒める',
    '揚げる', '茹でる', '蒸す', '切る', '混ぜる', '注ぐ', '乾杯', '居酒屋', '喫茶店', '弁当',
    'おにぎり', '漬物', '納豆', '豆腐', '海苔', '昆布', '梅干し', '焼き鳥', 'お好み焼き', 'たこ焼き',
  ],
  'dining-expert': [
    '懐石', '旬', '出汁', '歯ごたえ', '風味', '盛り付け', '旨味', '割り勘', 'お任せ', '会席',
    '精進料理', '郷土料理', '老舗', '板前', '料亭', '献立', '仕込み', '下ごしらえ', '隠し味', '薬味',
    '風情', '季節感', '滋味', '珍味', '絶品', '逸品', '堪能', '賞味期限', '消費期限', '食材',
    '鮮度', '熟成', '発酵', '醸造', '蒸留', '吟醸', '日本酒', '焼酎', 'お燗', '旨い',
    'こく', 'まろやか', 'さっぱり', 'こってり', 'あっさり', '香ばしい', '生臭い', '渋い', 'えぐい', 'しょっぱい',
  ],
  'travel-beginner': [
    '駅', '切符', '空港', '地図', '右', '左', '電車', '荷物', 'ホテル', '飛行機',
    '船', 'バス', 'タクシー', '自転車', '道', '橋', '町', '国', '外国', '旅行',
    '旅', '写真', '財布', '鞄', '傘', 'お金', '円', '入口', '出口', '受付',
    '部屋', '鍵', '窓', '階段', '上', '下', '前', '後ろ', '隣', '近い',
    '遠い', '北', '南', '東', '西', '真っ直ぐ', '曲がる', '渡る', '歩く', '止まる',
  ],
  'travel-intermediate': [
    '乗り換え', '出発', '到着', '観光', '両替', '片道', '往復', '宿泊', '予定', '日程',
    '計画', '出張', '留学', '帰国', '入国', '出国', '搭乗', '座席', '窓側', '通路',
    '指定席', '自由席', '特急', '急行', '各駅停車', '新幹線', '改札', '券売機', 'ホーム', '時刻表',
    '運賃', '料金', '割引', '遅れる', '間に合う', '乗る', '降りる', '通る', '迷う', '案内',
    '観光客', '名物', 'お土産', '温泉', '神社', '寺', '城', '博物館', '美術館', '遊園地',
  ],
  'travel-expert': [
    '旅館', '免税', '税関', '寄り道', '欠航', '運休', '延泊', '名所', '入国審査', '検疫',
    '査証', '旅券', '手荷物', '預ける', '搭乗券', '乗り継ぎ', '経由', '直行便', '往来', '周遊',
    '巡礼', '紀行', '名勝', '旧跡', '史跡', '世界遺産', '国宝', '離島', '秘境', '渓谷',
    '絶壁', '雪景色', '紅葉', '桜', '民宿', '素泊まり', '朝食付き', '大浴場', '露天風呂', '女将',
    '仲居', '布団', '浴衣', '草履', '駅弁', '車窓', '夜行', '臨時', '混雑', '渋滞',
  ],
}

export const PREMADE_DECKS = CATEGORIES.flatMap((category) =>
  DIFFICULTIES.map((difficulty) => {
    const id = `${category.id}-${difficulty.id}`
    return {
      id,
      category: category.id,
      difficulty: difficulty.id,
      title: `${category.label} · ${difficulty.label}`,
      description: DECK_DESCRIPTIONS[id],
      words: WORDS[id],
    }
  })
)