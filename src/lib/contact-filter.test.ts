import { containsContactInfo } from './contact-filter';

describe('containsContactInfo', () => {
  it.each([
    'пиши на anna.k@gmail.com',
    'insta: anna_k',
    'мій тг anna',
    '@anna_kyiv',
    'Напишіть мені в телеграм',
    'мій номер +38 (067) 123-45-67',
    'see www.example.org',
    'anna.com.ua',
  ])('flags contact details: %s', (text) => {
    expect(containsContactInfo(text)).toBe(true);
  });

  it.each([
    'У мене двоє дітей, 4 і 7 років, і кіт.',
    'Працюю в стартапі, люблю театр.',
    'Привіт! Мені дуже відгукується ваш текст, у мене теж є донька 2 років.',
    'Живу в Римі вже 3 роки.',
  ])('allows ordinary text: %s', (text) => {
    expect(containsContactInfo(text)).toBe(false);
  });
});
