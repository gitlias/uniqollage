import { useStore } from '../store';
import { useT } from '../i18n';
import { useUi } from '../ui';
import { SettingsPanel } from './SettingsPanel';

export function Toolbar() {
  const t = useT();
  const p = useStore((s) => s.project);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const settingsOpen = useUi((u) => u.settingsOpen);
  const s = useStore.getState();

  return (
    <div className="toolbar">
      <div className="group">
        <button onClick={() => useUi.getState().setFillOpen(true)} title={t('fillRandom')}>
          🎲 <span className="label">{t('fillRandom')}</span>
        </button>
        <button className="primary" disabled={!p.tiles.length} onClick={() => s.arrange(true)}>
          {t('shuffle')}
        </button>
        <button disabled={!p.tiles.length} onClick={() => s.arrange(false)} title={t('arrange')}>
          <span className="icon" aria-hidden>
            ⟳
          </span>
          <span className="label">{t('arrange')}</span>
        </button>
      </div>
      <div className="group">
        <button disabled={!canUndo} onClick={s.undo} title={`${t('undo')} (Ctrl+Z)`} aria-label={t('undo')}>
          ↶
        </button>
        <button disabled={!canRedo} onClick={s.redo} title={`${t('redo')} (Ctrl+Shift+Z)`} aria-label={t('redo')}>
          ↷
        </button>
      </div>
      <div className="group settings-anchor">
        <button
          className={`settings-toggle ${settingsOpen ? 'on' : ''}`}
          aria-expanded={settingsOpen}
          onClick={() => useUi.getState().setSettingsOpen(!settingsOpen)}
        >
          ⚙ <span className="label">{t('settings')}</span>
        </button>
        {settingsOpen && <SettingsPanel />}
      </div>
    </div>
  );
}
