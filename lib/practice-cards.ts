export type PracticeLanguage = 'de' | 'en' | 'ar';
export type PracticeLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export type PracticeCard = {
  id: string;
  level: PracticeLevel;
  topic: string;
  de: string;
  en: string;
  ar: string;
};

export const PRACTICE_CARDS: PracticeCard[] = [
  { id: 'a1-1', level: 'A1', topic: 'Begrüßung', de: 'Guten Morgen! Wie geht es dir?', en: 'Good morning! How are you?', ar: 'صباح الخير! كيف حالك؟' },
  { id: 'a1-2', level: 'A1', topic: 'Vorstellung', de: 'Ich heiße Ahmed und komme aus Ägypten.', en: 'My name is Ahmed and I come from Egypt.', ar: 'اسمي أحمد وأنا من مصر.' },
  { id: 'a1-3', level: 'A1', topic: 'Alltag', de: 'Ich trinke morgens gern Kaffee.', en: 'I like drinking coffee in the morning.', ar: 'أحب أن أشرب القهوة في الصباح.' },
  { id: 'a1-4', level: 'A1', topic: 'Einkaufen', de: 'Wie viel kostet dieses Brot?', en: 'How much does this bread cost?', ar: 'كم ثمن هذا الخبز؟' },
  { id: 'a1-5', level: 'A1', topic: 'Orientierung', de: 'Wo ist der nächste Bahnhof?', en: 'Where is the nearest train station?', ar: 'أين أقرب محطة قطار؟' },
  { id: 'a1-6', level: 'A1', topic: 'Zeit', de: 'Der Kurs beginnt um neun Uhr.', en: 'The course starts at nine o’clock.', ar: 'تبدأ الدورة الساعة التاسعة.' },
  { id: 'a2-1', level: 'A2', topic: 'Vergangenheit', de: 'Gestern habe ich meine Freunde besucht.', en: 'Yesterday I visited my friends.', ar: 'زرت أصدقائي أمس.' },
  { id: 'a2-2', level: 'A2', topic: 'Gesundheit', de: 'Ich kann heute nicht arbeiten, weil ich krank bin.', en: 'I cannot work today because I am ill.', ar: 'لا أستطيع العمل اليوم لأنني مريض.' },
  { id: 'a2-3', level: 'A2', topic: 'Wohnen', de: 'Unsere Wohnung liegt in der Nähe eines Parks.', en: 'Our apartment is near a park.', ar: 'تقع شقتنا بالقرب من حديقة.' },
  { id: 'a2-4', level: 'A2', topic: 'Planung', de: 'Am Wochenende möchten wir einen Ausflug machen.', en: 'At the weekend we would like to take a trip.', ar: 'نود القيام برحلة في عطلة نهاية الأسبوع.' },
  { id: 'a2-5', level: 'A2', topic: 'Bitte', de: 'Könnten Sie mir bitte den Weg erklären?', en: 'Could you please explain the way to me?', ar: 'هل يمكنك أن تشرح لي الطريق من فضلك؟' },
  { id: 'a2-6', level: 'A2', topic: 'Vergleich', de: 'Der Zug ist schneller als der Bus.', en: 'The train is faster than the bus.', ar: 'القطار أسرع من الحافلة.' },
  { id: 'b1-1', level: 'B1', topic: 'Erfahrung', de: 'Ich wohne seit drei Jahren in dieser Stadt.', en: 'I have lived in this city for three years.', ar: 'أعيش في هذه المدينة منذ ثلاث سنوات.' },
  { id: 'b1-2', level: 'B1', topic: 'Meinung', de: 'Meiner Meinung nach sollten Städte mehr Radwege bauen.', en: 'In my opinion, cities should build more cycle paths.', ar: 'في رأيي، ينبغي للمدن أن تبني المزيد من مسارات الدراجات.' },
  { id: 'b1-3', level: 'B1', topic: 'Bedingung', de: 'Wenn das Wetter schön ist, gehen wir im Wald spazieren.', en: 'If the weather is nice, we go for a walk in the forest.', ar: 'إذا كان الطقس جميلاً، نذهب للتنزه في الغابة.' },
  { id: 'b1-4', level: 'B1', topic: 'Arbeit', de: 'Obwohl die Aufgabe schwierig war, habe ich sie rechtzeitig beendet.', en: 'Although the task was difficult, I finished it on time.', ar: 'مع أن المهمة كانت صعبة، أنهيتها في الوقت المحدد.' },
  { id: 'b1-5', level: 'B1', topic: 'Vorschlag', de: 'An deiner Stelle würde ich früher mit der Vorbereitung anfangen.', en: 'If I were you, I would start preparing earlier.', ar: 'لو كنت مكانك، لبدأت الاستعداد مبكراً.' },
  { id: 'b1-6', level: 'B1', topic: 'Kommunikation', de: 'Bitte sag mir Bescheid, sobald du angekommen bist.', en: 'Please let me know as soon as you have arrived.', ar: 'من فضلك أخبرني بمجرد وصولك.' },
  { id: 'b2-1', level: 'B2', topic: 'Argumentation', de: 'Einerseits spart Homeoffice Zeit, andererseits fehlt der direkte Austausch.', en: 'On the one hand, working from home saves time; on the other, direct interaction is missing.', ar: 'من ناحية يوفر العمل من المنزل الوقت، ومن ناحية أخرى يفتقد التواصل المباشر.' },
  { id: 'b2-2', level: 'B2', topic: 'Passiv', de: 'Die neue Regelung wird im kommenden Monat eingeführt.', en: 'The new regulation will be introduced next month.', ar: 'سيتم تطبيق اللائحة الجديدة الشهر المقبل.' },
  { id: 'b2-3', level: 'B2', topic: 'Konjunktiv II', de: 'Hätte ich mehr Zeit gehabt, hätte ich an dem Seminar teilgenommen.', en: 'If I had had more time, I would have attended the seminar.', ar: 'لو كان لدي وقت أكثر، لكنت شاركت في الندوة.' },
  { id: 'b2-4', level: 'B2', topic: 'Nominalisierung', de: 'Durch die regelmäßige Wiederholung lässt sich der Wortschatz festigen.', en: 'Vocabulary can be consolidated through regular repetition.', ar: 'يمكن ترسيخ المفردات من خلال المراجعة المنتظمة.' },
  { id: 'b2-5', level: 'B2', topic: 'Bericht', de: 'Der Studie zufolge hat sich die Luftqualität deutlich verbessert.', en: 'According to the study, air quality has improved significantly.', ar: 'وفقاً للدراسة، تحسنت جودة الهواء بشكل ملحوظ.' },
  { id: 'b2-6', level: 'B2', topic: 'Zweck', de: 'Die Daten wurden verschlüsselt, damit niemand unbefugt darauf zugreifen kann.', en: 'The data was encrypted so that nobody could access it without authorization.', ar: 'تم تشفير البيانات حتى لا يتمكن أحد من الوصول إليها دون تصريح.' },
  { id: 'c1-1', level: 'C1', topic: 'Einschränkung', de: 'So überzeugend der Vorschlag zunächst klingt, lässt er zentrale Fragen unbeantwortet.', en: 'As convincing as the proposal initially sounds, it leaves key questions unanswered.', ar: 'على الرغم من أن الاقتراح يبدو مقنعاً في البداية، فإنه يترك أسئلة أساسية بلا إجابة.' },
  { id: 'c1-2', level: 'C1', topic: 'Wissenschaft', de: 'Die Ergebnisse sind insofern bemerkenswert, als sie bisherigen Annahmen widersprechen.', en: 'The results are remarkable insofar as they contradict previous assumptions.', ar: 'النتائج جديرة بالملاحظة لأنها تتعارض مع الافتراضات السابقة.' },
  { id: 'c1-3', level: 'C1', topic: 'Register', de: 'Es bedarf einer sorgfältigen Abwägung sämtlicher Vor- und Nachteile.', en: 'A careful consideration of all advantages and disadvantages is required.', ar: 'يتطلب الأمر موازنة دقيقة لجميع المزايا والعيوب.' },
  { id: 'c1-4', level: 'C1', topic: 'Folgerung', de: 'Aus dem Umstand, dass die Nachfrage steigt, lässt sich nicht zwangsläufig ein langfristiger Trend ableiten.', en: 'The fact that demand is rising does not necessarily imply a long-term trend.', ar: 'لا يمكن بالضرورة استنتاج اتجاه طويل الأمد من حقيقة ارتفاع الطلب.' },
  { id: 'c1-5', level: 'C1', topic: 'Zugeständnis', de: 'Zugegebenermaßen ist die Umsetzung aufwendig, dennoch überwiegt der langfristige Nutzen.', en: 'Admittedly, implementation is demanding, yet the long-term benefit outweighs it.', ar: 'من المسلم به أن التنفيذ معقد، ومع ذلك تفوق فائدته على المدى الطويل.' },
  { id: 'c1-6', level: 'C1', topic: 'Präzision', de: 'Die Maßnahme zielt weniger auf kurzfristige Entlastung als vielmehr auf strukturelle Veränderung ab.', en: 'The measure aims less at short-term relief than at structural change.', ar: 'لا يهدف الإجراء إلى تخفيف قصير الأمد بقدر ما يهدف إلى تغيير هيكلي.' },
];

export const LANGUAGE_LABELS: Record<PracticeLanguage, string> = { de: 'Deutsch', en: 'English', ar: 'العربية' };
export const LANGUAGE_FLAGS: Record<PracticeLanguage, string> = { de: '🇩🇪', en: '🇬🇧', ar: '🇸🇦' };
