import { getRequestConfig } from 'next-intl/server';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = routing.locales.find((item) => item === requestedLocale) ?? routing.defaultLocale;

  const messages = locale === 'ko' ? ko : en;
  if (process.env.NODE_ENV === 'development') {
    const developmentMessages =
      locale === 'ko'
        ? (await import('../../messages/dev-ko.json')).default
        : (await import('../../messages/dev-en.json')).default;
    return {
      locale,
      messages: { ...messages, reviews: { ...messages.reviews, ...developmentMessages.reviews } },
    };
  }
  return { locale, messages };
});
