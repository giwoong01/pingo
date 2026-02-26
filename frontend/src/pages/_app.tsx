import React from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import '@/styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isAuthPage = router.pathname.startsWith('/auth/');
  const [checked, setChecked] = React.useState(false);
  const [hasToken, setHasToken] = React.useState(false);

  React.useEffect(() => {
    setHasToken(Boolean(Cookies.get('access_token')));
    setChecked(true);
  }, [router.asPath]);

  React.useEffect(() => {
    if (!checked) return;
    if (isAuthPage) return;
    if (!hasToken) {
      router.replace('/auth/login');
    }
  }, [checked, hasToken, isAuthPage, router]);

  if (!checked) return null;
  if (!isAuthPage && !hasToken) return null;
  return (
    <>
      <Head>
        <title>Pingo</title>
        <meta name="description" content="Pingo monitoring dashboard" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;
