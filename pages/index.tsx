import React from 'react';
import Auth from '@/components/Auth';
import HomeComponent from '@/components/Home';

const authEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTH === 'true' ? true : false;

const Home: React.FC = () => {
  return (
  <>
      {authEnabled ? <Auth /> : <HomeComponent user={null} />}
      </>
  );
};
export default Home;