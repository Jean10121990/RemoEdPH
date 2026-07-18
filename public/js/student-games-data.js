/**
 * Play & Learn bank: exactly 10 items per category per level.
 * Levels: Little Seeds (Age 3), Sprouts (Age 4), Saplings (Age 5), Young Stewards (Age 6)
 * Categories: reading, speaking, writing, listening, moral
 */
window.REMOED_GAME_DATA_MASTER = {
  'Little Seeds (Age 3)': {
    reading: [
      { word: 'A', phonetic: '/eɪ/', options: ['A', 'B', 'C', 'D'], correct: 0 },
      { word: 'B', phonetic: '/biː/', options: ['B', 'P', 'D', 'R'], correct: 0 },
      { word: 'CAT', phonetic: '/kæt/', options: ['Cat', 'Dog', 'Car', 'Hat'], correct: 0 },
      { word: 'DOG', phonetic: '/dɔːg/', options: ['Dog', 'Cat', 'Sun', 'Moon'], correct: 0 },
      { word: 'SUN', phonetic: '/sʌn/', options: ['Sun', 'Moon', 'Star', 'Cloud'], correct: 0 },
      { word: 'BALL', phonetic: '/bɔːl/', options: ['Ball', 'Doll', 'Toy', 'Car'], correct: 0 },
      { word: 'MOM', phonetic: '/mɑːm/', options: ['Mom', 'Dad', 'Map', 'Man'], correct: 0 },
      { word: 'DAD', phonetic: '/dæd/', options: ['Dad', 'Bad', 'Sad', 'Had'], correct: 0 },
      { word: 'RED', phonetic: '/red/', options: ['Red', 'Bed', 'Led', 'Fed'], correct: 0 },
      { word: 'BIG', phonetic: '/bɪɡ/', options: ['Big', 'Bag', 'Bug', 'Beg'], correct: 0 }
    ],
    speaking: [
      'Say: "Hello!"',
      'Say: "My name is [Your Name]"',
      'Say: "I am happy"',
      'Say: "Thank you"',
      'Say: "Please"',
      'Say: "Good morning"',
      'Say the colors: red, blue, yellow',
      'Count out loud from 1 to 5',
      'Say: "I like apples"',
      'Say: "Bye-bye, see you!"'
    ],
    writing: [
      'Trace or write the letter A',
      'Trace or write the letter B',
      'Write your first name',
      'Write the number 1',
      'Write the number 2',
      'Draw a circle and write O',
      'Write: Mom',
      'Write: Dad',
      'Write numbers 1 to 5',
      'Write: Cat'
    ],
    listening: [
      { audio: '🐱', question: 'What animal says "Meow"?', options: ['Cat', 'Dog', 'Bird', 'Fish'], correct: 0 },
      { audio: '🐶', question: 'What animal says "Woof"?', options: ['Dog', 'Cat', 'Cow', 'Duck'], correct: 0 },
      { audio: '🚗', question: 'What makes a "Vroom" sound?', options: ['Car', 'Bicycle', 'Book', 'Ball'], correct: 0 },
      { audio: '🐄', question: 'What animal says "Moo"?', options: ['Cow', 'Pig', 'Cat', 'Bird'], correct: 0 },
      { audio: '🦆', question: 'What animal says "Quack"?', options: ['Duck', 'Dog', 'Fish', 'Horse'], correct: 0 },
      { audio: '🔔', question: 'What goes "Ding-dong"?', options: ['Bell', 'Ball', 'Book', 'Bird'], correct: 0 },
      { audio: '🌧️', question: 'What falls from clouds?', options: ['Rain', 'Toys', 'Cars', 'Books'], correct: 0 },
      { audio: '🌙', question: 'What do we see at night in the sky?', options: ['Moon', 'Sun', 'Car', 'Tree'], correct: 0 },
      { audio: '🍎', question: 'Which one is a fruit?', options: ['Apple', 'Ball', 'Shoe', 'Chair'], correct: 0 },
      { audio: '👟', question: 'What do we wear on our feet?', options: ['Shoes', 'Hats', 'Gloves', 'Scarves'], correct: 0 }
    ],
    moral: [
      {
        title: 'Sharing is Caring',
        story: 'Tommy had two apples. He saw his friend Sarah had no snack. Tommy shared one apple with Sarah. Sarah smiled and said "Thank you!" Both friends were happy.',
        question: 'What did Tommy do that made Sarah happy?',
        options: ['He shared his apple', 'He kept both apples', 'He ignored Sarah', 'He ran away'],
        correct: 0,
        moral: 'Sharing with others makes everyone happy!'
      },
      {
        title: 'Gentle Hands',
        story: 'Mia wanted to hold the class bunny. Teacher said to use soft, gentle hands. Mia patted the bunny softly. The bunny stayed calm and happy.',
        question: 'How should Mia touch the bunny?',
        options: ['With gentle hands', 'Very roughly', 'By pulling', 'By chasing'],
        correct: 0,
        moral: 'Gentle hands keep friends and animals safe.'
      },
      {
        title: 'Waiting Turns',
        story: 'Leo wanted the red truck. His friend was still playing. Leo waited and sang a song. Soon it was his turn, and he felt proud.',
        question: 'What did Leo do?',
        options: ['He waited his turn', 'He grabbed the truck', 'He cried loudly', 'He hid the toy'],
        correct: 0,
        moral: 'Waiting your turn is kind and fair.'
      },
      {
        title: 'Saying Sorry',
        story: 'Ana bumped into Ben and Ben dropped his blocks. Ana said "I am sorry" and helped pick them up. Ben smiled again.',
        question: 'What helped Ben feel better?',
        options: ['Ana said sorry and helped', 'Ana ran away', 'Ana laughed', 'Ana ignored him'],
        correct: 0,
        moral: 'Saying sorry and helping fixes little mistakes.'
      },
      {
        title: 'Listening Ears',
        story: 'During story time, Sam wanted to talk. Then he remembered to use listening ears. He heard a funny part and laughed with friends.',
        question: 'What should Sam do during story time?',
        options: ['Use listening ears', 'Talk over the teacher', 'Run around', 'Hide books'],
        correct: 0,
        moral: 'Listening shows respect.'
      },
      {
        title: 'Kind Words',
        story: 'Nina saw a new classmate looking shy. Nina said "Hi! Want to play?" The new friend smiled and joined the game.',
        question: 'How did Nina help?',
        options: ['She used kind words', 'She took toys away', 'She whispered secrets', 'She walked away'],
        correct: 0,
        moral: 'Kind words welcome new friends.'
      },
      {
        title: 'Clean Up Helpers',
        story: 'After art, crayons were everywhere. The class sang a clean-up song and put things away. The room looked bright again.',
        question: 'What did the children do?',
        options: ['They cleaned up together', 'They left a mess', 'They hid crayons', 'They tore paper'],
        correct: 0,
        moral: 'Helping clean up cares for our classroom.'
      },
      {
        title: 'Indoor Voices',
        story: 'Max used a big outdoor voice inside. Friends covered their ears. Max switched to a soft indoor voice. Everyone felt calm.',
        question: 'Which voice is better indoors?',
        options: ['A soft indoor voice', 'A shouting voice', 'No voice ever', 'A scary roar'],
        correct: 0,
        moral: 'Soft voices help everyone feel safe inside.'
      },
      {
        title: 'Hug or Ask',
        story: 'Priya wanted a hug from her friend. She asked first: "May I hug you?" Her friend said yes, and both felt happy.',
        question: 'What should you do before a hug?',
        options: ['Ask first', 'Grab without asking', 'Push', 'Yell'],
        correct: 0,
        moral: 'Asking first respects others\' bodies.'
      },
      {
        title: 'Trying Again',
        story: 'Omar tried to zip his coat and failed. He took a breath and tried again. Zip! He cheered for himself.',
        question: 'What did Omar do when it was hard?',
        options: ['He tried again', 'He gave up forever', 'He threw the coat', 'He blamed a friend'],
        correct: 0,
        moral: 'Trying again helps us grow.'
      }
    ]
  },
  'Sprouts (Age 4)': {
    reading: [
      { word: 'BOOK', phonetic: '/bʊk/', options: ['Book', 'Look', 'Cook', 'Hook'], correct: 0 },
      { word: 'TREE', phonetic: '/triː/', options: ['Tree', 'Free', 'See', 'Bee'], correct: 0 },
      { word: 'HOUSE', phonetic: '/haʊs/', options: ['House', 'Mouse', 'Loud', 'Cloud'], correct: 0 },
      { word: 'WATER', phonetic: '/ˈwɔːtər/', options: ['Water', 'Later', 'Mater', 'Cater'], correct: 0 },
      { word: 'FISH', phonetic: '/fɪʃ/', options: ['Fish', 'Dish', 'Wish', 'Push'], correct: 0 },
      { word: 'BIRD', phonetic: '/bɜːrd/', options: ['Bird', 'Word', 'Herd', 'Card'], correct: 0 },
      { word: 'PLAY', phonetic: '/pleɪ/', options: ['Play', 'Plan', 'Pray', 'Clay'], correct: 0 },
      { word: 'JUMP', phonetic: '/dʒʌmp/', options: ['Jump', 'Bump', 'Dump', 'Lamp'], correct: 0 },
      { word: 'HAPPY', phonetic: '/ˈhæpi/', options: ['Happy', 'Heavy', 'Honey', 'Hobby'], correct: 0 },
      { word: 'FRIEND', phonetic: '/frend/', options: ['Friend', 'Find', 'Front', 'Fresh'], correct: 0 }
    ],
    speaking: [
      'Tell a short story about your day',
      'Describe your favorite toy',
      'Say: "My favorite color is [color] because..."',
      'Practice: "Good morning", "Good afternoon", "Good night"',
      'Name three animals and make their sounds',
      'Tell what you ate for breakfast',
      'Describe the weather today',
      'Say two kind things to a friend',
      'Count from 1 to 10 out loud',
      'Introduce yourself in three sentences'
    ],
    writing: [
      'Write a sentence: "I love my family"',
      'Write 3 words that start with B',
      'Write: "Today is a sunny day"',
      'Write your full name',
      'Write numbers 1 to 10',
      'Write two colors you like',
      'Write: "I can help"',
      'Write a short story (2 sentences)',
      'Write three animal names',
      'Write: "Please" and "Thank you"'
    ],
    listening: [
      { audio: '🐦', question: 'Which animal can fly?', options: ['Bird', 'Fish', 'Cat', 'Dog'], correct: 0 },
      { audio: '🌊', question: 'Where do fish live?', options: ['Water', 'Sky', 'Land', 'Tree'], correct: 0 },
      { audio: '🌳', question: 'What grows tall with leaves?', options: ['Tree', 'Ball', 'Cup', 'Shoe'], correct: 0 },
      { audio: '☀️', question: 'What shines in the daytime?', options: ['Sun', 'Moon', 'Lamp only', 'Star only'], correct: 0 },
      { audio: '🛏️', question: 'Where do we sleep?', options: ['Bed', 'Fridge', 'Sink', 'Door'], correct: 0 },
      { audio: '🚌', question: 'What takes kids to school?', options: ['Bus', 'Pillow', 'Spoon', 'Sock'], correct: 0 },
      { audio: '🦷', question: 'What do we brush every day?', options: ['Teeth', 'Walls', 'Clouds', 'Roads'], correct: 0 },
      { audio: '🧤', question: 'What keeps hands warm?', options: ['Gloves', 'Plates', 'Books', 'Rocks'], correct: 0 },
      { audio: '🥕', question: 'Which is a vegetable?', options: ['Carrot', 'Candy', 'Cake', 'Chips'], correct: 0 },
      { audio: '👂', question: 'Which body part helps us hear?', options: ['Ears', 'Elbows', 'Knees', 'Toes'], correct: 0 }
    ],
    moral: [
      {
        title: 'Helping Others',
        story: 'Maria saw an old lady carrying heavy bags. Maria offered to help. The old lady was grateful and said Maria was very kind.',
        question: 'Why did Maria feel happy?',
        options: ['She helped someone', 'She got candy', 'She avoided work', 'She made fun'],
        correct: 0,
        moral: 'Helping others makes us feel good inside!'
      },
      {
        title: 'Including Friends',
        story: 'At recess, Jay saw someone sitting alone. He invited them to join the circle game. Soon everyone was laughing together.',
        question: 'What kind choice did Jay make?',
        options: ['He included someone', 'He hid the ball', 'He left the playground', 'He teased quietly'],
        correct: 0,
        moral: 'Including others builds friendship.'
      },
      {
        title: 'Telling the Truth',
        story: 'Sam spilled juice and almost blamed the dog. Then he told Mom the truth. Mom helped clean and thanked him for honesty.',
        question: 'What was the better choice?',
        options: ['Tell the truth', 'Blame the dog', 'Hide the cup', 'Run away'],
        correct: 0,
        moral: 'Honesty builds trust.'
      },
      {
        title: 'Careful With Toys',
        story: 'Lila borrowed a puzzle. She kept the pieces in the box and returned it neatly. Her friend was happy to share again.',
        question: 'How did Lila care for the toy?',
        options: ['She kept it neat and returned it', 'She lost pieces', 'She broke it', 'She hid it'],
        correct: 0,
        moral: 'Taking care of shared things shows respect.'
      },
      {
        title: 'Calm Down Breaths',
        story: 'When Kai felt angry, he took three deep breaths instead of yelling. Then he used words to explain his feelings.',
        question: 'What helped Kai?',
        options: ['Calm breaths and words', 'Yelling louder', 'Hitting', 'Throwing toys'],
        correct: 0,
        moral: 'Calm breaths help us choose kind actions.'
      },
      {
        title: 'Please and Thank You',
        story: 'Nora asked, "May I have a crayon, please?" and said "Thank you" when she got it. The teacher smiled.',
        question: 'Which manners did Nora use?',
        options: ['Please and thank you', 'Grabbing quietly', 'Demanding now', 'Ignoring others'],
        correct: 0,
        moral: 'Polite words make sharing easier.'
      },
      {
        title: 'Line Leader Fairness',
        story: 'It was not Ben\'s turn to be line leader. He waited patiently. Tomorrow would be his turn, and he cheered for a friend today.',
        question: 'What did Ben practice?',
        options: ['Fairness and patience', 'Cutting in line', 'Pushing ahead', 'Complaining all day'],
        correct: 0,
        moral: 'Fair turns help the whole class.'
      },
      {
        title: 'Comfort a Friend',
        story: 'Emma fell and scraped her knee. Omar brought a tissue and sat with her until she felt better.',
        question: 'How did Omar show care?',
        options: ['He comforted his friend', 'He laughed first', 'He walked away', 'He took her snack'],
        correct: 0,
        moral: 'Comforting friends is a kind superpower.'
      },
      {
        title: 'Try New Foods',
        story: 'Sushi day felt new to Mei. She tried one small bite bravely. She discovered she liked cucumber rolls!',
        question: 'What brave choice did Mei make?',
        options: ['She tried something new', 'She threw food', 'She hid under the table', 'She said never forever'],
        correct: 0,
        moral: 'Trying new things can be exciting.'
      },
      {
        title: 'Outdoor Care',
        story: 'After a picnic, the class put wrappers in the trash. The park stayed clean for the next family.',
        question: 'Why put trash away?',
        options: ['To care for shared places', 'So animals eat plastic', 'To make more mess', 'Because trash is treasure'],
        correct: 0,
        moral: 'We care for parks by cleaning up.'
      }
    ]
  },
  'Saplings (Age 5)': {
    reading: [
      { word: 'SCHOOL', phonetic: '/skuːl/', options: ['School', 'Cool', 'Pool', 'Tool'], correct: 0 },
      { word: 'LEARN', phonetic: '/lɜːrn/', options: ['Learn', 'Earn', 'Yearn', 'Turn'], correct: 0 },
      { word: 'TEACHER', phonetic: '/ˈtiːtʃər/', options: ['Teacher', 'Feature', 'Creature', 'Reacher'], correct: 0 },
      { word: 'FRIEND', phonetic: '/frend/', options: ['Friend', 'Trend', 'Bend', 'Send'], correct: 0 },
      { word: 'STORY', phonetic: '/ˈstɔːri/', options: ['Story', 'Store', 'Storm', 'Start'], correct: 0 },
      { word: 'LISTEN', phonetic: '/ˈlɪsən/', options: ['Listen', 'Lesson', 'Litter', 'Lizard'], correct: 0 },
      { word: 'BRAVE', phonetic: '/breɪv/', options: ['Brave', 'Break', 'Bread', 'Brief'], correct: 0 },
      { word: 'SMILE', phonetic: '/smaɪl/', options: ['Smile', 'Small', 'Smell', 'Simple'], correct: 0 },
      { word: 'SHARE', phonetic: '/ʃer/', options: ['Share', 'Shore', 'Sharp', 'Shirt'], correct: 0 },
      { word: 'FAMILY', phonetic: '/ˈfæməli/', options: ['Family', 'Famous', 'Farmer', 'Fancy'], correct: 0 }
    ],
    speaking: [
      'Give a 1-minute talk about your favorite subject',
      'Describe your best friend in detail',
      'Explain how to make a simple snack',
      'Read a short paragraph aloud with expression',
      'Tell about a time you helped someone',
      'Describe your morning routine step by step',
      'Share two facts about animals',
      'Explain the rules of a game you like',
      'Talk about a book character you admire',
      'Practice introducing yourself politely'
    ],
    writing: [
      'Write a short letter to a friend',
      'Write a mini adventure story (4–5 sentences)',
      'Write: "When I grow up, I want to..."',
      'Write a paragraph about your family',
      'Write three sentences using because',
      'Write a thank-you note',
      'List five words about school and use two in sentences',
      'Write about your favorite season',
      'Rewrite: "i like books" with capital letters and a period',
      'Write two questions you want to ask a teacher'
    ],
    listening: [
      { audio: '🎓', question: 'Where do children go to learn?', options: ['School', 'Park', 'Mall', 'Beach only'], correct: 0 },
      { audio: '📚', question: 'What do we use to read stories?', options: ['Books', 'Toys', 'Food', 'Socks'], correct: 0 },
      { audio: '🧠', question: 'What helps us think and learn?', options: ['Our brain', 'Our shoes', 'Our backpack alone', 'A remote'], correct: 0 },
      { audio: '🤝', question: 'What do friends do when they work together?', options: ['Cooperate', 'Always argue', 'Hide forever', 'Ignore rules'], correct: 0 },
      { audio: '⏰', question: 'What helps us know when class starts?', options: ['A clock or schedule', 'A pillow', 'A crayon only', 'A leaf'], correct: 0 },
      { audio: '🗺️', question: 'What shows places on paper?', options: ['A map', 'A spoon', 'A sock', 'A balloon'], correct: 0 },
      { audio: '🧩', question: 'What activity fits pieces together?', options: ['A puzzle', 'Running only', 'Sleeping', 'Shouting'], correct: 0 },
      { audio: '🎤', question: 'What do we use to speak to a group?', options: ['Our voice (or mic)', 'Our elbows', 'Our backpack', 'Our shoes'], correct: 0 },
      { audio: '📝', question: 'What do we use to write ideas?', options: ['Paper and pencil', 'Only water', 'Only stones', 'Only clouds'], correct: 0 },
      { audio: '🌱', question: 'What do seeds need to become plants?', options: ['Water, soil, and light', 'Candy', 'Screens', 'Noise'], correct: 0 }
    ],
    moral: [
      {
        title: 'Honesty is the Best Policy',
        story: 'John accidentally broke his teacher\'s pen. He told the truth. The teacher thanked him for honesty and said mistakes happen.',
        question: 'What did John learn?',
        options: ['Honesty is important', 'Lying is okay', 'Avoiding problems helps', 'Breaking things is fine'],
        correct: 0,
        moral: 'Being honest builds trust and shows good character!'
      },
      {
        title: 'Apologize and Fix',
        story: 'Tara stepped on a classmate\'s drawing. She apologized and offered to help redraw the flower. They worked together and became closer friends.',
        question: 'What made the situation better?',
        options: ['Apology plus helping fix it', 'Blaming someone else', 'Laughing and leaving', 'Hiding the paper'],
        correct: 0,
        moral: 'Sorry is stronger when we help make things right.'
      },
      {
        title: 'Fair Teams',
        story: 'During group work, Noah wanted all the easy jobs. Then he switched so everyone got a fair turn. The project finished faster.',
        question: 'What helped the team?',
        options: ['Sharing jobs fairly', 'Doing only easy jobs', 'Leaving the group', 'Ignoring teammates'],
        correct: 0,
        moral: 'Fair teamwork helps everyone succeed.'
      },
      {
        title: 'Standing Up Kindly',
        story: 'Someone teased a classmate about glasses. Aya said, "That is not kind. Please stop." She invited the classmate to sit with her.',
        question: 'What did Aya practice?',
        options: ['Standing up for others kindly', 'Teasing back harder', 'Staying silent forever', 'Walking away laughing'],
        correct: 0,
        moral: 'Brave kindness protects friends.'
      },
      {
        title: 'Keeping Promises',
        story: 'Eli promised to return a library book. He remembered, even when he wanted another story night. The librarian trusted him more.',
        question: 'Why are promises important?',
        options: ['They build trust', 'They do not matter', 'Only adults keep them', 'Books are unlimited forever'],
        correct: 0,
        moral: 'Keeping promises shows we are trustworthy.'
      },
      {
        title: 'Gratitude Habit',
        story: 'After a guest reader visited, the class wrote thank-you cards. The guest felt appreciated and planned another visit.',
        question: 'What did gratitude do?',
        options: ['It made someone feel valued', 'It made more mess', 'It wasted paper only', 'It caused arguments'],
        correct: 0,
        moral: 'Saying thank you strengthens community.'
      },
      {
        title: 'Patience With Learning',
        story: 'Reading a new word felt hard for Sol. Instead of quitting, Sol asked for a tip and practiced slowly. Progress felt exciting.',
        question: 'What attitude helped Sol?',
        options: ['Patient practice', 'Giving up quickly', 'Copying secretly', 'Avoiding books'],
        correct: 0,
        moral: 'Patience turns hard skills into strengths.'
      },
      {
        title: 'Respect Differences',
        story: 'Classmates liked different games. Instead of arguing, they took turns choosing. Everyone felt included.',
        question: 'How did they show respect?',
        options: ['Taking turns with choices', 'Only one person decides forever', 'Mocking other games', 'Hiding equipment'],
        correct: 0,
        moral: 'Respecting differences keeps play fun.'
      },
      {
        title: 'Digital Kindness',
        story: 'During tablet time, Remy wanted to grab a device. Instead Remy asked politely and waited. The group stayed peaceful.',
        question: 'What was the kind tech choice?',
        options: ['Ask and wait your turn', 'Grab first', 'Yell for a tablet', 'Unplug others'],
        correct: 0,
        moral: 'Screens need the same manners as toys.'
      },
      {
        title: 'Courage to Ask',
        story: 'Ivy did not understand a math problem. She raised her hand and asked. The teacher explained, and Ivy solved the next one.',
        question: 'Why was asking brave and smart?',
        options: ['Questions help us learn', 'Asking is cheating', 'Only quiet kids learn', 'Teachers dislike questions'],
        correct: 0,
        moral: 'Asking questions is a learning superpower.'
      }
    ]
  },
  'Young Stewards (Age 6)': {
    reading: [
      { word: 'NATURE', phonetic: '/ˈneɪtʃər/', options: ['Nature', 'Future', 'Picture', 'Capture'], correct: 0 },
      { word: 'GROWTH', phonetic: '/ɡroʊθ/', options: ['Growth', 'Truth', 'Youth', 'Booth'], correct: 0 },
      { word: 'PLANET', phonetic: '/ˈplænɪt/', options: ['Planet', 'Blanket', 'Magnet', 'Cabinet'], correct: 0 },
      { word: 'STEWARD', phonetic: '/ˈstuːərd/', options: ['Steward', 'Forward', 'Coward', 'Toward'], correct: 0 },
      { word: 'PROTECT', phonetic: '/prəˈtekt/', options: ['Protect', 'Project', 'Protest', 'Perfect'], correct: 0 },
      { word: 'COMMUNITY', phonetic: '/kəˈmjuːnəti/', options: ['Community', 'Comedy', 'Company', 'Compass'], correct: 0 },
      { word: 'RESPONSIBLE', phonetic: '/rɪˈspɑːnsəbəl/', options: ['Responsible', 'Possible', 'Flexible', 'Visible'], correct: 0 },
      { word: 'HABITAT', phonetic: '/ˈhæbɪtæt/', options: ['Habitat', 'Habit', 'Helmet', 'Harvest'], correct: 0 },
      { word: 'RECYCLE', phonetic: '/riːˈsaɪkəl/', options: ['Recycle', 'Bicycle', 'Circle', 'Miracle'], correct: 0 },
      { word: 'RESPECT', phonetic: '/rɪˈspekt/', options: ['Respect', 'Inspect', 'Expect', 'Suspect'], correct: 0 }
    ],
    speaking: [
      'Talk about one way you can help the Earth',
      'Describe a plant or animal you care about',
      'Explain why teamwork is important',
      'Share a goal you want to reach this year',
      'Give a short speech about kindness at school',
      'Explain how to recycle at home',
      'Describe a problem and a fair solution',
      'Retell a story with a beginning, middle, and end',
      'Interview a classmate: ask three thoughtful questions',
      'Persuade a friend to join a clean-up with reasons'
    ],
    writing: [
      'Write about taking care of our planet (5–7 sentences)',
      'Write a short story about a young helper',
      'Complete: "I can make a difference by..."',
      'Write a paragraph about a role model',
      'Write instructions: how to water a plant',
      'Write two cause-and-effect sentences about litter',
      'Write a letter to your future self about a goal',
      'Compare city and nature in 4 sentences',
      'Write a poem (4 lines) about growth',
      'Edit this idea into a clear paragraph: helping friends'
    ],
    listening: [
      { audio: '🌍', question: 'What do we call the world we live on?', options: ['Planet', 'School', 'Garden', 'House'], correct: 0 },
      { audio: '🌱', question: 'What do plants need to grow?', options: ['Water and sunlight', 'Toys', 'Cars', 'Screens'], correct: 0 },
      { audio: '♻️', question: 'What does recycling help us do?', options: ['Reuse materials and reduce waste', 'Make more trash', 'Ignore nature', 'Use more plastic forever'], correct: 0 },
      { audio: '🐝', question: 'Why are bees important?', options: ['They help plants grow by pollinating', 'They build cars', 'They write books', 'They teach math only'], correct: 0 },
      { audio: '💧', question: 'Why should we not waste water?', options: ['Living things need clean water', 'Water is useless', 'Only oceans matter', 'Pipes make infinite water'], correct: 0 },
      { audio: '🗑️', question: 'Where should litter go?', options: ['In a trash or recycling bin', 'On the ground', 'In rivers', 'In someone\'s bag secretly'], correct: 0 },
      { audio: '🤝', question: 'What is stewardship?', options: ['Caring for people, places, and nature', 'Taking everything for yourself', 'Ignoring problems', 'Only playing games'], correct: 0 },
      { audio: '🌳', question: 'How do trees help us?', options: ['They give oxygen and shade', 'They make noise only', 'They block all learning', 'They replace food forever'], correct: 0 },
      { audio: '🦉', question: 'What is a habitat?', options: ['A place where an animal lives', 'A type of sandwich', 'A school subject only', 'A video game level'], correct: 0 },
      { audio: '🧭', question: 'What should young stewards practice daily?', options: ['Kindness and responsibility', 'Wasting resources', 'Teasing classmates', 'Leaving messes'], correct: 0 }
    ],
    moral: [
      {
        title: 'Caring for Our World',
        story: 'Lina picked up litter in the park and watered the community garden. Friends joined her. Together they made the park cleaner and greener.',
        question: 'What did Lina and her friends show?',
        options: ['We can care for our shared spaces', 'Only adults can help', 'Littering is fine', 'Gardens do not matter'],
        correct: 0,
        moral: 'Young stewards care for people, plants, and places!'
      },
      {
        title: 'Lead by Example',
        story: 'When others left snack wrappers, Mateo quietly picked them up and invited one friend to help. Soon more kids joined without being forced.',
        question: 'How did Mateo lead?',
        options: ['By example and invitation', 'By scolding angrily', 'By doing nothing', 'By blaming teachers only'],
        correct: 0,
        moral: 'Leadership can start with small, visible kindness.'
      },
      {
        title: 'Protect Living Things',
        story: 'The class found a bird nest nearby. Instead of poking it, they watched from a distance and told a teacher. The chicks stayed safe.',
        question: 'What was the steward choice?',
        options: ['Protect and observe carefully', 'Touch the eggs', 'Make loud noises', 'Move the nest alone'],
        correct: 0,
        moral: 'Protecting habitats shows respect for life.'
      },
      {
        title: 'Fair Share of Resources',
        story: 'Art supplies were limited. The group made a rotation chart so everyone got equal time with the paints. Projects still looked great.',
        question: 'Why was the chart helpful?',
        options: ['It shared resources fairly', 'It let one student keep everything', 'It created more fighting', 'It wasted paint'],
        correct: 0,
        moral: 'Fair sharing cares for the whole community.'
      },
      {
        title: 'Speak Up for Earth',
        story: 'At a family meeting, Noor suggested a weekly walk instead of a short car trip. The family tried it and enjoyed fresher air.',
        question: 'What did Noor practice?',
        options: ['Speaking up with a helpful idea', 'Staying silent forever', 'Forcing others rudely', 'Ignoring climate care'],
        correct: 0,
        moral: 'Respectful ideas can inspire change at home.'
      },
      {
        title: 'Repair Before Replace',
        story: 'A toy wheel loosened. Instead of throwing it away, Sam and Dad fixed it with a screwdriver. The toy lasted longer and less trash was made.',
        question: 'What value did they show?',
        options: ['Repairing reduces waste', 'New is always better', 'Broken means hopeless', 'Trash is the first choice'],
        correct: 0,
        moral: 'Repairing is a smart steward habit.'
      },
      {
        title: 'Include Every Voice',
        story: 'In a planning circle, quieter students had not spoken. The facilitator invited each person to share one idea. Better plans appeared.',
        question: 'Why invite every voice?',
        options: ['Everyone belongs and adds value', 'Only loud kids matter', 'Ideas should be secret', 'Voting is useless'],
        correct: 0,
        moral: 'Stewards make space for every voice.'
      },
      {
        title: 'Long-Term Thinking',
        story: 'The class wanted to plant flowers that bloom once, or trees that grow for years. They chose trees for lasting shade and homes for birds.',
        question: 'What guided their choice?',
        options: ['Thinking about the future', 'Only today\'s fun', 'Avoiding nature', 'Choosing the fastest fad'],
        correct: 0,
        moral: 'Stewards think beyond today.'
      },
      {
        title: 'Courage With Compassion',
        story: 'A rumor spread about a classmate. Jordan refused to share it and reminded friends that rumors can hurt. The rumor stopped.',
        question: 'What steward skill did Jordan use?',
        options: ['Courage with compassion', 'Gossip for fun', 'Silent approval', 'Public shaming'],
        correct: 0,
        moral: 'Protecting dignity is part of caring for community.'
      },
      {
        title: 'Daily Steward Habits',
        story: 'Each morning, the class checked: lights off when leaving, water taps closed, kindness first. Small habits added up to a proud classroom culture.',
        question: 'What makes stewardship strong?',
        options: ['Small daily habits done together', 'One big day only', 'Waiting for adults forever', 'Talking without action'],
        correct: 0,
        moral: 'Daily habits grow young stewards.'
      }
    ]
  }
};
