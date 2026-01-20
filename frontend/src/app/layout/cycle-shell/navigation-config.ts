export type TopbarSection = 'dashboard' | 'data-entry' | 'data-reference';

export interface TopbarItem {
  key: TopbarSection;
  label: string;
  path: string;
}

export interface MenuItem {
  label: string;
  path?: string;
  children?: MenuItem[];
}

export interface PlaceholderSection {
  slug: string;
  title: string;
  description?: string;
}

const placeholderPath = (slug: string) => `placeholder/${slug}`;

const scope1Placeholders: PlaceholderSection[] = [
  { slug: 'scope1-3', title: '1.3 Process Emission' },
  { slug: 'scope1-4', title: '1.4 Fugitive Emission' },
  { slug: 'scope1-5', title: '1.5 Biomass Emission' },
  { slug: 'scope1-4-1', title: '1.4.1 Refrigerant' },
  { slug: 'scope1-4-2', title: '1.4.2 Fire suppression' },
  { slug: 'scope1-4-3', title: '1.4.3 Septic' },
  { slug: 'scope1-4-4', title: '1.4.4 Fertilizer' },
  { slug: 'scope1-4-5', title: '1.4.5 WWTP' },
];

const scope2Placeholders: PlaceholderSection[] = [
  { slug: 'scope2-2', title: '2.2 Purchased Energy' },
];

const scope3Placeholders: PlaceholderSection[] = [
  { slug: 'scope3-3-1', title: '3.1 Purchased Goods & Services' },
  { slug: 'scope3-3-2', title: '3.2 Capital goods' },
  { slug: 'scope3-3-3', title: '3.3 Fuel- and energy-related activities' },
  { slug: 'scope3-3-4', title: '3.4 Upstream transportation and distribution' },
  { slug: 'scope3-3-5', title: '3.5 Waste generated in operations' },
  { slug: 'scope3-3-6', title: '3.6 Business travel' },
  { slug: 'scope3-3-7', title: '3.7 Employee commuting' },
  { slug: 'scope3-3-8', title: '3.8 Upstream leased assets' },
  { slug: 'scope3-3-9', title: '3.9 Downstream transportation and distribution' },
  { slug: 'scope3-3-10', title: '3.10 Processing of sold products' },
  { slug: 'scope3-3-11', title: '3.11 Use of sold products' },
  { slug: 'scope3-3-12', title: '3.12 End-of-life treatment of sold products' },
  { slug: 'scope3-3-13', title: '3.13 Downstream leased assets' },
  { slug: 'scope3-3-14', title: '3.14 Franchises' },
  { slug: 'scope3-3-15', title: '3.15 Investments' },
];

const placeholderSections = [
  ...scope1Placeholders,
  ...scope2Placeholders,
  ...scope3Placeholders,
].map(section => ({
  ...section,
  description: section.description ?? 'Coming soon',
}));

export const PLACEHOLDER_SECTIONS: PlaceholderSection[] = placeholderSections;

const placeholderItem = (slug: string, label: string): MenuItem => ({
  label,
  path: placeholderPath(slug),
});

export const TOPBAR_ITEMS: TopbarItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: 'dashboard' },
  { key: 'data-entry', label: 'Data Entry', path: 'data-entry' },
  { key: 'data-reference', label: 'Data reference', path: 'data-reference/ef-ar5' },
];

const scope1Menu: MenuItem[] = [
  { label: '1.1 Stationary Combustion', path: 'cfo/scope1-stationary' },
  { label: '1.2 Mobile Combustion', path: 'cfo/scope1-mobile' },
  placeholderItem('scope1-3', '1.3 Process Emission'),
  {
    label: '1.4 Fugitive Emission',
    path: placeholderPath('scope1-4'),
    children: [
      placeholderItem('scope1-4-1', '1.4.1 Refrigerant'),
      placeholderItem('scope1-4-2', '1.4.2 Fire suppression'),
      placeholderItem('scope1-4-3', '1.4.3 Septic'),
      placeholderItem('scope1-4-4', '1.4.4 Fertilizer'),
      placeholderItem('scope1-4-5', '1.4.5 WWTP'),
    ],
  },
  placeholderItem('scope1-5', '1.5 Biomass Emission'),
];

const scope2Menu: MenuItem[] = [
  { label: '2.1 Purchased Electricity', path: 'cfo/scope2-electricity' },
  placeholderItem('scope2-2', '2.2 Purchased Energy'),
];

const scope3Menu: MenuItem[] = scope3Placeholders.map(section => placeholderItem(section.slug, section.title));

export const SIDEBAR_MENU: Record<TopbarSection, MenuItem[]> = {
  dashboard: [
    { label: 'Dashboard', path: 'dashboard' },
    { label: 'Summary', path: 'summary' },
    { label: 'Review & Lock', path: 'review-lock' },
    { label: 'Scope 1', children: scope1Menu },
    { label: 'Scope 2', children: scope2Menu },
    { label: 'Scope 3', children: scope3Menu },
  ],
  'data-entry': [
    { label: 'Fr-01', path: 'fr01' },
    { label: 'Fr-02', path: 'fr02' },
    { label: 'Fr-03.1', path: 'fr03-1' },
    { label: 'Fr-03.2', path: 'fr03-2' },
    { label: 'Screen scope 3', path: 'scope3-screen' },
    { label: 'Fr-04.1', path: 'fr04-1' },
    { label: 'Fr-04.2', path: 'fr04-2' },
    { label: 'Fr-05', path: 'fr05' },
    { label: 'Scope 1', children: scope1Menu },
    { label: 'Scope 2', children: scope2Menu },
    { label: 'Scope 3', children: scope3Menu },
  ],
  'data-reference': [
    { label: 'EF TGO AR5', path: 'data-reference/ef-ar5' },
    { label: 'EF (1)', path: 'data-reference/ef-1' },
  ],
};

export const TOPBAR_DEFAULT_PATHS: Record<TopbarSection, string> = {
  dashboard: 'dashboard',
  'data-entry': 'data-entry',
  'data-reference': 'data-reference/ef-ar5',
};
