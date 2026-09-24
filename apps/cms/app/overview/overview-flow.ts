export type OverviewStep = {
  actionLabel: string;
  description: string;
  key: 'create-site' | 'add-page' | 'edit-page';
  title: string;
};

export function getOverviewStep({
  pageCount,
  siteCount,
}: {
  pageCount: number;
  siteCount: number;
}): OverviewStep {
  if (siteCount === 0) {
    return {
      actionLabel: 'Create a website',
      description: 'Start with a name. We will create the first homepage for you.',
      key: 'create-site',
      title: 'Create your website',
    };
  }

  if (pageCount === 0) {
    return {
      actionLabel: 'Add your first page',
      description: 'Add a page, then open the visual editor to shape it.',
      key: 'add-page',
      title: 'Add your first page',
    };
  }

  return {
    actionLabel: 'Open your pages',
    description: 'Choose a page to edit, preview, or make live.',
    key: 'edit-page',
    title: 'Keep building your website',
  };
}
