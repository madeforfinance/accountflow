import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Page, EmptyState, Btn } from '../components/ui';

export default function NotFound() {
  return (
    <Page title="Not found">
      <EmptyState
        icon={<Compass size={28} />}
        title="Page not found"
        text="The page you are looking for does not exist or has been moved."
        action={<Link to="/"><Btn variant="primary">Back to dashboard</Btn></Link>}
      />
    </Page>
  );
}
