// Privacy Policy (GDPR, Swiss FADP). DRAFT: Iryna approves the text and fills in the
// [bracketed] details before release; then set `draft: false`.
import type { LegalDocument, LegalLanguage } from '../domain/documents';

export const LEGAL_VERSION = '2026-11-28';

const uk: LegalDocument = {
  title: 'Політика конфіденційності',
  updated: LEGAL_VERSION,
  draft: true,
  sections: [
    {
      heading: '1. Хто відповідає за ваші дані',
      paragraphs: [
        'Контролер даних: [повне ім’я або назва компанії, адреса]. Контакт з питань приватності: [email].',
        'Ця політика пояснює, які дані збирає застосунок Boston Home, навіщо, де вони зберігаються і які у вас права за Загальним регламентом ЄС про захист даних (GDPR) та швейцарським Законом про захист даних (FADP).',
      ],
    },
    {
      heading: '2. Які дані ми збираємо',
      paragraphs: [
        'Обліковий запис: ідентифікатор і email від Sign in with Apple (Apple може дати прихований email). Ми не просимо номер телефону чи документи.',
        'Профіль: ім’я, яке ви показуєте, вікова група, мови, фото профілю, статус перевірки.',
        'Оголошення: те, що ви пишете про себе і про бажане спільне життя, умови (діти, тварини, звички, побут), країна і місто. Координати зберігаються лише приблизно (з точністю близько 5 км і зі зсувом), точна адреса не зберігається ніколи.',
        'Взаємодія: запити і їхні статуси, ваш вільний час, заплановані відеозустрічі, скарги, які ви подали, блокування, історія кредитів.',
        'Ми збираємо лише те, що потрібно для роботи сервісу. Ми не показуємо ваші контакти чи точне місце іншим учасницям до відеозустрічі.',
      ],
    },
    {
      heading: '3. Навіщо і на якій підставі',
      paragraphs: [
        'Щоб надавати сервіс: показувати оголошення, передавати запити і організовувати відеозустрічі (виконання договору, ст. 6(1)(b) GDPR).',
        'Щоб захищати учасниць: перевірка, модерація скарг, блокування і призупинення облікових записів (законний інтерес у безпеці спільноти, ст. 6(1)(f) GDPR).',
        'Дані в оголошенні можуть розкривати чутливу інформацію, наприклад про ваше особисте життя. Ви публікуєте їх добровільно і можете змінити або видалити будь-коли (явна згода, ст. 9(2)(a) GDPR).',
      ],
    },
    {
      heading: '4. Відеозустрічі',
      paragraphs: [
        'Відеозустрічі проходять через Daily.co в приватних кімнатах з персональними посиланнями, що діють недовго.',
        'Ми нічого не записуємо: ні відео, ні звук, ні чат. Daily не зберігає вміст дзвінків. Ми зберігаємо лише час зустрічі та її статус.',
      ],
    },
    {
      heading: '5. Обробники даних',
      paragraphs: [
        'Supabase (база даних, вхід, сховище фото): дані зберігаються в ЄС, у регіоні Франкфурт (Німеччина).',
        'Daily.co (відеозв’язок): обробляє дані дзвінка лише під час зустрічі. Daily — компанія зі США; передача захищена стандартними договірними положеннями ЄС.',
        'Apple (Sign in with Apple): підтверджує вашу особу під час входу.',
        'Ми не продаємо ваші дані і не передаємо їх рекламним мережам.',
      ],
    },
    {
      heading: '6. Скільки ми зберігаємо',
      paragraphs: [
        'Поки існує ваш обліковий запис. Запити без відповіді закінчуються автоматично.',
        'Після видалення облікового запису профіль, оголошення, фото, запити, зустрічі та кредити видаляються одразу. Скарги на інших учасниць зберігаються для модерації без зв’язку з вашим обліковим записом.',
      ],
    },
    {
      heading: '7. Ваші права',
      paragraphs: [
        'Ви можете отримати копію своїх даних: «Мій профіль» → «Експортувати мої дані». Ви отримаєте файл JSON; посилання на фото в ньому діють одну годину.',
        'Ви можете виправити дані у профілі й оголошенні, а також видалити обліковий запис: «Мій профіль» → «Видалити обліковий запис».',
        'Ви маєте право заперечити проти обробки або обмежити її, написавши на [email].',
        'Ви можете подати скаргу до наглядового органу: у Швейцарії — Федеральний уповноважений із захисту даних та інформації (FDPIC), в ЄС — орган вашої країни.',
      ],
    },
    {
      heading: '8. Вік і безпека',
      paragraphs: [
        'Сервіс лише для повнолітніх (від 18 років). Не діліться документами, адресою чи номерами авто в оголошеннях і під час дзвінків.',
      ],
    },
    {
      heading: '9. Зміни',
      paragraphs: ['Якщо ми змінимо цю політику, ми оновимо дату вгорі і повідомимо вас у застосунку про суттєві зміни.'],
    },
  ],
};

const en: LegalDocument = {
  title: 'Privacy Policy',
  updated: LEGAL_VERSION,
  draft: true,
  sections: [
    {
      heading: '1. Who is responsible for your data',
      paragraphs: [
        'Controller: [full name or company name, address]. Privacy contact: [email].',
        'This policy explains what data the Boston Home app collects, why, where it is stored, and your rights under the EU General Data Protection Regulation (GDPR) and the Swiss Federal Act on Data Protection (FADP).',
      ],
    },
    {
      heading: '2. What we collect',
      paragraphs: [
        'Account: an identifier and email from Sign in with Apple (Apple may give us a hidden relay email). We never ask for a phone number or documents.',
        'Profile: the name you show, age band, languages, profile photo and verification status.',
        'Listing: what you write about yourself and the shared life you are looking for, your conditions (children, pets, habits, household), country and city. Coordinates are stored only approximately (about 5 km, with an offset); your exact address is never stored.',
        'Activity: requests and their status, your free time, booked video meetings, reports you filed, blocks and your credit history.',
        'We collect only what the service needs. Your contact details and exact location are never shown to other members before a video meeting.',
      ],
    },
    {
      heading: '3. Why, and on what legal basis',
      paragraphs: [
        'To provide the service: showing listings, passing on requests and arranging video meetings (performance of a contract, GDPR art. 6(1)(b)).',
        'To keep members safe: verification, handling reports, blocking and suspending accounts (legitimate interest in the safety of the community, GDPR art. 6(1)(f)).',
        'Your listing may reveal sensitive information, for example about your private life. You publish it voluntarily and can change or delete it at any time (explicit consent, GDPR art. 9(2)(a)).',
      ],
    },
    {
      heading: '4. Video meetings',
      paragraphs: [
        'Video meetings run on Daily.co in private rooms with personal, short-lived links.',
        'Nothing is recorded: no video, no audio, no chat. Daily does not store call content. We only keep the meeting time and its status.',
      ],
    },
    {
      heading: '5. Processors',
      paragraphs: [
        'Supabase (database, sign-in, photo storage): data is stored in the EU, in the Frankfurt region (Germany).',
        'Daily.co (video calls): processes call data only during a meeting. Daily is a US company; the transfer is covered by the EU Standard Contractual Clauses.',
        'Apple (Sign in with Apple): confirms your identity when you sign in.',
        'We do not sell your data or share it with advertising networks.',
      ],
    },
    {
      heading: '6. How long we keep it',
      paragraphs: [
        'For as long as your account exists. Unanswered requests expire automatically.',
        'When you delete your account, your profile, listing, photos, requests, meetings and credits are deleted at once. Reports about other members are kept for moderation, no longer linked to your account.',
      ],
    },
    {
      heading: '7. Your rights',
      paragraphs: [
        'You can get a copy of your data: My profile → Export my data. You receive a JSON file; the photo links in it work for one hour.',
        'You can correct your data in your profile and listing, and delete your account: My profile → Delete account.',
        'You can object to or restrict processing by writing to [email].',
        'You can complain to a supervisory authority: in Switzerland the Federal Data Protection and Information Commissioner (FDPIC), in the EU the authority of your country.',
      ],
    },
    {
      heading: '8. Age and safety',
      paragraphs: [
        'The service is for adults (18 and over) only. Don’t share documents, your address or car plates in listings or during calls.',
      ],
    },
    {
      heading: '9. Changes',
      paragraphs: ['If we change this policy, we update the date above and tell you in the app about important changes.'],
    },
  ],
};

export const privacy: Record<LegalLanguage, LegalDocument> = { uk, en };
