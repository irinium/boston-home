// Terms of Use. DRAFT: Iryna approves the text and fills in the [bracketed] details before
// release; then set `draft: false`.
import type { LegalDocument, LegalLanguage } from '../domain/documents';

import { LEGAL_VERSION } from './privacy';

const uk: LegalDocument = {
  title: 'Умови користування',
  updated: LEGAL_VERSION,
  draft: true,
  sections: [
    {
      heading: '1. Про сервіс',
      paragraphs: [
        'Boston Home допомагає жінкам знайти партнерку для спільного життя і побуту («бостонський шлюб»). Сервіс надає [повне ім’я або назва компанії, адреса]. Користуючись застосунком, ви приймаєте ці умови і Політику конфіденційності.',
      ],
    },
    {
      heading: '2. Хто може користуватися',
      paragraphs: [
        'Лише жінки віком від 18 років. Один обліковий запис на людину. Дані про себе мають бути правдивими.',
      ],
    },
    {
      heading: '3. Правила спільноти',
      paragraphs: [
        'Будьте шанобливі. Заборонені погрози, переслідування, образи, шахрайство, фейкові профілі і реклама.',
        'Не публікуйте контакти, адреси чи посилання в оголошеннях і запитах: знайомство починається з відеозустрічі в застосунку.',
        'Не записуйте відеозустрічі і не робіть знімків екрана без згоди іншої учасниці.',
        'Якщо щось не так, завершіть дзвінок, заблокуйте і поскаржтеся. Ми розглядаємо кожну скаргу.',
      ],
    },
    {
      heading: '4. Модерація',
      paragraphs: [
        'Ми можемо приховати оголошення або призупинити обліковий запис, якщо він порушує ці умови чи загрожує безпеці учасниць. Серйозна скарга від людини, з якою ви спілкувалися, може призупинити обліковий запис одразу, до перевірки.',
        'Якщо ви вважаєте, що рішення помилкове, напишіть на [email].',
      ],
    },
    {
      heading: '5. Кредити',
      paragraphs: [
        'Кредити потрібні, щоб надсилати запити, коли це ввімкнено. Вони не мають грошової вартості, їх не можна обміняти чи передати. Якщо запит відхилили, він закінчився або ви його відкликали, кредит повертається.',
        'Покупки в застосунку обробляють App Store і Google Play за їхніми правилами повернення коштів.',
      ],
    },
    {
      heading: '6. Відповідальність',
      paragraphs: [
        'Ми не перевіряємо кожну учасницю особисто і не гарантуємо, що знайомство приведе до спільного життя. Ви самі вирішуєте, з ким зустрічатися і що розповідати. Перед переїздом зустріньтеся в безпечному публічному місці.',
        'Наша відповідальність обмежена в межах, дозволених законом; це не обмежує відповідальність за умисел чи грубу недбалість.',
      ],
    },
    {
      heading: '7. Припинення',
      paragraphs: ['Ви можете видалити обліковий запис будь-коли в розділі «Мій профіль».'],
    },
    {
      heading: '8. Право і зміни',
      paragraphs: [
        'Застосовується право [країна]. Якщо ви споживачка в ЄС, за вами зберігається захист обов’язкових норм вашої країни.',
        'Про суттєві зміни умов ми повідомимо в застосунку заздалегідь.',
      ],
    },
  ],
};

const en: LegalDocument = {
  title: 'Terms of Use',
  updated: LEGAL_VERSION,
  draft: true,
  sections: [
    {
      heading: '1. About the service',
      paragraphs: [
        'Boston Home helps women find a partner to share a life and a home with (a “Boston marriage”). The service is provided by [full name or company name, address]. By using the app you accept these terms and the Privacy Policy.',
      ],
    },
    {
      heading: '2. Who can use it',
      paragraphs: ['Women aged 18 and over only. One account per person. What you say about yourself must be true.'],
    },
    {
      heading: '3. Community rules',
      paragraphs: [
        'Be respectful. Threats, stalking, harassment, scams, fake profiles and advertising are not allowed.',
        'Don’t post contact details, addresses or links in listings and requests: getting to know each other starts with a video meeting in the app.',
        'Don’t record video meetings or take screenshots without the other member’s consent.',
        'If something feels wrong, end the call, block and report. We review every report.',
      ],
    },
    {
      heading: '4. Moderation',
      paragraphs: [
        'We may hide a listing or suspend an account that breaks these terms or puts members at risk. A serious report from someone you were in contact with can suspend an account at once, pending review.',
        'If you think a decision was wrong, write to [email].',
      ],
    },
    {
      heading: '5. Credits',
      paragraphs: [
        'Credits are needed to send requests when this is switched on. They have no cash value and cannot be exchanged or transferred. If a request is declined, expires or you withdraw it, the credit is returned.',
        'In-app purchases are handled by the App Store and Google Play under their refund rules.',
      ],
    },
    {
      heading: '6. Liability',
      paragraphs: [
        'We do not check every member in person and cannot promise that a contact leads to a shared home. You decide whom to meet and what to share. Meet in a safe public place before moving in together.',
        'Our liability is limited as far as the law allows; this does not limit liability for intent or gross negligence.',
      ],
    },
    {
      heading: '7. Ending your account',
      paragraphs: ['You can delete your account at any time in My profile.'],
    },
    {
      heading: '8. Law and changes',
      paragraphs: [
        'The law of [country] applies. If you are a consumer in the EU, you keep the protection of the mandatory rules of your country.',
        'We will tell you in the app in advance about important changes to these terms.',
      ],
    },
  ],
};

export const terms: Record<LegalLanguage, LegalDocument> = { uk, en };
