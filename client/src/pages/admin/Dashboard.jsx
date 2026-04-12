import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    api.getAdminStats().then(setStats).catch(console.error);
    api.getSettings().then(setSettings).catch(console.error);
  }, []);

  const toggleParentFeature = async () => {
    const newVal = settings.parent_feature_enabled === 'true' ? 'false' : 'true';
    await api.updateSetting('parent_feature_enabled', newVal);
    setSettings(s => ({ ...s, parent_feature_enabled: newVal }));
  };

  if (!stats) return <div className="loading">加载中...</div>;

  return (
    <div className="page admin-dashboard">
      <h2>管理后台</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.studentCount}</div>
          <div className="stat-label">学生账户</div>
          <Link to="/admin/students" className="stat-link">管理</Link>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.parentCount}</div>
          <div className="stat-label">家长账户</div>
          <Link to="/admin/parents" className="stat-link">管理</Link>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.dictationCount}</div>
          <div className="stat-label">默写次数</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.recitationCount}</div>
          <div className="stat-label">背诵次数</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.writingCount}</div>
          <div className="stat-label">写作次数</div>
        </div>
      </div>

      <div className="settings-section">
        <h3>全局设置</h3>
        <div className="setting-row">
          <span>家长账户功能</span>
          <button
            className={`btn-toggle ${settings.parent_feature_enabled === 'true' ? 'on' : 'off'}`}
            onClick={toggleParentFeature}
          >
            {settings.parent_feature_enabled === 'true' ? '已开启' : '已关闭'}
          </button>
        </div>
        <div className="setting-row">
          <span>默认每日时长限制</span>
          <span>{settings.default_daily_limit || 40} 分钟</span>
        </div>
        <div className="setting-row">
          <span>学生端首选朗读</span>
          <select
            value={settings.tts_engine === 'kokoro' ? 'kokoro' : 'piper'}
            onChange={async (e) => {
              const v = e.target.value;
              await api.updateSetting('tts_engine', v);
              setSettings((s) => ({ ...s, tts_engine: v }));
            }}
          >
            <option value="piper">Piper（服务端本地，默认）</option>
            <option value="kokoro">Kokoro（浏览器 ONNX，体积大、首启慢）</option>
          </select>
        </div>
        <div className="setting-row">
          <span>Kokoro 音色 ID</span>
          <input
            key={`kokoro-voice-${settings.kokoro_voice ?? ''}`}
            type="text"
            style={{ minWidth: '140px' }}
            placeholder="zm_yunjian"
            defaultValue={settings.kokoro_voice || 'zm_yunjian'}
            onBlur={async (e) => {
              const v = e.target.value.trim() || 'zm_yunjian';
              if (v === (settings.kokoro_voice || 'zm_yunjian')) return;
              await api.updateSetting('kokoro_voice', v);
              setSettings((s) => ({ ...s, kokoro_voice: v }));
            }}
          />
        </div>
        <div className="setting-row">
          <span>Kokoro 模型（Hugging Face ID）</span>
          <input
            key={`kokoro-model-${settings.kokoro_model_id ?? ''}`}
            type="text"
            style={{ minWidth: '280px', maxWidth: '100%' }}
            placeholder="onnx-community/Kokoro-82M-v1.1-zh-ONNX"
            defaultValue={settings.kokoro_model_id || 'onnx-community/Kokoro-82M-v1.1-zh-ONNX'}
            onBlur={async (e) => {
              const def = 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
              const v = e.target.value.trim() || def;
              if (v === (settings.kokoro_model_id || def)) return;
              await api.updateSetting('kokoro_model_id', v);
              setSettings((s) => ({ ...s, kokoro_model_id: v }));
            }}
          />
        </div>
      </div>
    </div>
  );
}
