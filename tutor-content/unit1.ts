import type { Activity, Objective, SourceRef, Unit } from '../tutor-engine/types';

// Reviewed from the original scanned PDF pages 11–14 (printed 10–13), and
// answer PDF pages 1–2 (printed 265–266). These are newly authored prompts.
// The rest of the textbook is deliberately absent from this package.
const source = (printedPage: number, exercise?: number, item?: number, status: SourceRef['status'] = 'verified'): SourceRef => ({
  bookPdfPage: printedPage + 1, printedPage, exercise, item,
  ...(exercise ? { answerPdfPage: exercise <= 8 ? 1 : 2, answerPrintedPage: exercise <= 8 ? 265 : 266 } : {}), status,
});
const activity = (objectiveId: string, id: string, phase: Activity['phase'], instruction: string, ref: SourceRef, expected?: string[], explanation?: string, responseMode: Activity['responseMode'] = 'text'): Activity => ({
  id, objectiveId, phase, instruction, source: ref, expected, explanation, responseMode,
  estimatedSeconds: phase === 'writing' || phase === 'speaking' ? 180 : 75,
  generated: true,
});
const objective = (id: string, title: string, rule: string, refs: SourceRef[], activities: Activity[], prerequisites: string[] = []): Objective => ({
  id, title, rule, prerequisites, source: refs, activities,
  required: ['recognition', 'recall', 'application', 'retention'],
});

export const unit1: Unit = {
  id: 'ga-b2c1-2017-u1',
  title: 'Verbposition in einfachen Sätzen',
  sourceHash: '1c1df66e168479bf805360ff110cd817681ee28c373c2144f32a66c1ae9cf79a',
  answerHash: '973a6f9c946867a9d078fc703c546f9cf7707460452e7145a6a89460adea9786',
  totalBookPages: 313,
  bookPages: [11, 12, 13, 14], answerPages: [1, 2], reviewStatus: 'source-reviewed',
  expectedExercises: [1,2,3,4,5,6,7,8,9,10],
  objectives: [
    objective('finite-v2', 'Finite verb in position 2', 'In statements and W-questions, the conjugated verb follows the first sentence constituent. A multiword opening still occupies one position.', [source(10), source(11, 1), source(12, 3)], [
      activity('finite-v2', 'v2-diagnostic', 'diagnostic', 'Without hints, rewrite this as one statement beginning with “Heute”: “Ich gehe ins Schwimmbad.”', source(10), ['Heute gehe ich ins Schwimmbad.']),
      activity('finite-v2', 'v2-teach', 'teach', 'Read the rule. Then write one sentence beginning with “Morgen” about your plans. The finite verb must come immediately after that opening.', source(10), undefined, 'The whole opening is position 1. The finite verb is position 2; the subject follows it.'),
      activity('finite-v2', 'v2-guided', 'guided', 'Use these blocks to make a statement: “Am Montag | lerne | ich | Deutsch”. Write the full sentence.', source(11, 1), ['Am Montag lerne ich Deutsch.']),
      activity('finite-v2', 'v2-recall', 'recall', 'Rewrite “Ich lerne morgen für die Prüfung.” beginning with “Morgen”. No hints.', source(11, 2), ['Morgen lerne ich für die Prüfung.']),
      activity('finite-v2', 'v2-apply', 'application', 'Write a natural sentence about a dental appointment beginning with “Nächste Woche”.', source(10)),
      activity('finite-v2', 'v2-retain', 'retention', 'A week later: Rewrite “Ich gehe am Freitag zum Zahnarzt.” beginning with “Am Freitag”.', source(10), ['Am Freitag gehe ich zum Zahnarzt.']),
    ]),
    objective('verb-bracket', 'Sentence bracket', 'With separable verbs, modals, infinitives, participles, passive, future and related verb forms, the finite verb is in position 2 and another verb part can close the bracket.', [source(10), source(11, 1), source(12, 5)], [
      activity('verb-bracket', 'bracket-diagnostic', 'diagnostic', 'Without hints, reorder: “Ich | um acht Uhr | an | rufe | meine Freundin”.', source(11, 1), ['Ich rufe meine Freundin um acht Uhr an.', 'Ich rufe um acht Uhr meine Freundin an.']),
      activity('verb-bracket', 'bracket-teach', 'teach', 'Explain in your own words where “rufe” and “an” go in a statement with “anrufen”.', source(10), undefined, 'The conjugated part comes second; the separable prefix goes to the end.'),
      activity('verb-bracket', 'bracket-guided', 'guided', 'Put these blocks in order: “Ich | muss | heute | arbeiten”.', source(12, 5), ['Ich muss heute arbeiten.']),
      activity('verb-bracket', 'bracket-recall', 'recall', 'Rewrite “Ich habe den Termin verschoben.” beginning with “Gestern”.', source(10), ['Gestern habe ich den Termin verschoben.']),
      activity('verb-bracket', 'bracket-apply', 'application', 'Write a sentence about a patient appointment using “müssen” and another verb.', source(10)),
      activity('verb-bracket', 'bracket-retain', 'retention', 'A week later: Rewrite “Ich hole die Medikamente morgen ab.” beginning with “Morgen”.', source(10), ['Morgen hole ich die Medikamente ab.']),
    ]),
    objective('fronting', 'Fronting and subject placement', 'A time expression, object or subordinate clause can occupy position 1. The finite verb follows; the subject often follows the verb. A preceding subordinate clause is separated by a comma.', [source(10), source(11, 2), source(12, 3)], [
      activity('fronting', 'front-diagnostic', 'diagnostic', 'Rewrite “Ich kann heute nicht kommen.” beginning with “Heute”.', source(11, 2), ['Heute kann ich nicht kommen.']),
      activity('fronting', 'front-teach', 'teach', 'Read the rule and explain why “Heute ich kann nicht kommen” is wrong.', source(10), undefined, '“Heute” fills position 1, so “kann” must immediately follow it.'),
      activity('fronting', 'front-guided', 'guided', 'Complete the sentence: “Wenn ich Zeit habe, ___ ich dich an.” Use the correct form of “rufen”.', source(10), ['Wenn ich Zeit habe, rufe ich dich an.']),
      activity('fronting', 'front-recall', 'recall', 'Rewrite “Ich komme morgen, wenn ich Zeit habe.” beginning with the “wenn” clause.', source(10), ['Wenn ich Zeit habe, komme ich morgen.']),
      activity('fronting', 'front-writing', 'writing', 'Write two sentences in a short formal email. Begin one with a time expression and one with a subordinate clause.', source(12, 4)),
      activity('fronting', 'front-retain', 'retention', 'A week later: Rewrite “Ich rufe dich an, wenn ich Zeit habe.” beginning with the subordinate clause.', source(10), ['Wenn ich Zeit habe, rufe ich dich an.']),
    ]),
    objective('verb-first', 'Verb-first sentences', 'Yes/no questions, imperatives, and the verb-first wish and conditional patterns shown in the unit start with the conjugated verb.', [source(11), source(13, 7), source(13, 8), source(13, 10)], [
      activity('verb-first', 'first-diagnostic', 'diagnostic', 'Turn “Du hast morgen Zeit.” into a yes/no question.', source(11), ['Hast du morgen Zeit?']),
      activity('verb-first', 'first-teach', 'teach', 'Explain which word comes first in “Hast du Zeit?” and why.', source(11), undefined, 'The conjugated verb begins a yes/no question.'),
      activity('verb-first', 'first-guided', 'guided', 'Rewrite “Wenn du Zeit hast, ruf mich an.” without “wenn”.', source(13, 8), ['Hast du Zeit, ruf mich an.']),
      activity('verb-first', 'first-recall', 'recall', 'Write a polite imperative using “kommen” and “Sie”.', source(11), ['Kommen Sie bitte.']),
      activity('verb-first', 'first-apply', 'application', 'Write a new conditional sentence without “wenn” about a dental visit.', source(13, 8)),
      activity('verb-first', 'first-retain', 'retention', 'A week later: Turn “Sie haben morgen Zeit.” into a yes/no question.', source(11), ['Haben Sie morgen Zeit?']),
    ]),
    objective('after-bracket', 'Elements after the final verb part', 'Comparisons with “als” or “wie” can follow the final verb part, particularly when long. Spoken German can place other elements there too; this is a later-topic connection.', [source(11), source(13, 6)], [
      activity('after-bracket', 'after-diagnostic', 'diagnostic', 'Rewrite this comparison so “als gestern” follows the final verb part: “Heute bin ich schneller als gestern angekommen.”', source(13, 6), ['Heute bin ich schneller angekommen als gestern.']),
      activity('after-bracket', 'after-teach', 'teach', 'Explain where the comparison goes in “Heute bin ich schneller angekommen als gestern.”', source(11), undefined, 'A comparison may come after the final participle; the sentence bracket is still intact.'),
      activity('after-bracket', 'after-guided', 'guided', 'Move “als letzte Woche” behind “gearbeitet”: “Ich habe mehr als letzte Woche gearbeitet.”', source(13, 6), ['Ich habe mehr gearbeitet als letzte Woche.']),
      activity('after-bracket', 'after-recall', 'recall', 'Rewrite: “Er hat so viel wie seine Kollegin gelernt.” Put the comparison after the last verb.', source(13, 6), ['Er hat so viel gelernt wie seine Kollegin.']),
      activity('after-bracket', 'after-apply', 'application', 'Write your own natural comparison using a final verb part followed by “als” or “wie”.', source(13, 6)),
      activity('after-bracket', 'after-retain', 'retention', 'A week later: Move the comparison after the final verb: “Sie hat mehr als letzte Woche gearbeitet.”', source(13, 6), ['Sie hat mehr gearbeitet als letzte Woche.']),
    ]),
    objective('punctuation-diagnosis', 'Word order and punctuation diagnosis', 'Find a word-order or comma error, explain its cause, and repair it without changing the intended meaning.', [source(10), source(12, 3, 1, 'unmapped'), source(12, 4), source(13, 9)], [
      activity('punctuation-diagnosis', 'error-diagnostic', 'diagnostic', 'Correct this sentence: “Morgen, gehe ich zum Zahnarzt.”', source(13, 9), ['Morgen gehe ich zum Zahnarzt.']),
      activity('punctuation-diagnosis', 'error-teach', 'teach', 'Explain why there is no comma after “Morgen” in “Morgen gehe ich zum Zahnarzt.”', source(10), undefined, 'A simple opening time expression is not separated from the verb by a comma.'),
      activity('punctuation-diagnosis', 'error-guided', 'guided', 'Correct: “Wenn ich morgen Zeit habe gehe ich zum Zahnarzt.”', source(10), ['Wenn ich morgen Zeit habe, gehe ich zum Zahnarzt.']),
      activity('punctuation-diagnosis', 'error-recall', 'recall', 'Correct: “Heute ich habe einen Termin.”', source(12, 3), ['Heute habe ich einen Termin.']),
      activity('punctuation-diagnosis', 'error-speaking', 'speaking', 'Say two natural sentences about a clinic appointment: one beginning with a time expression and one beginning with a verb.', source(11), undefined, undefined, 'speech'),
      activity('punctuation-diagnosis', 'error-retain', 'retention', 'A week later: Correct “Am Dienstag, habe ich einen Termin.”', source(10), ['Am Dienstag habe ich einen Termin.']),
    ]),
  ],
};
