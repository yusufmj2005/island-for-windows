import '@fontsource-variable/inter';
import './styles.css';
import './settings/settings.css';
import { createRoot } from 'react-dom/client';
import { Island } from './components/Island';
import { SettingsApp } from './settings/SettingsApp';

// One page, two windows: the island, and the settings window (index.html#settings).
const isSettings = location.hash === '#settings';
if (isSettings) document.documentElement.classList.add('settings');

createRoot(document.getElementById('root')!).render(isSettings ? <SettingsApp /> : <Island />);
