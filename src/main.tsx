import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// 注意：这里刻意不使用 <StrictMode>。
// MapLibre 是命令式生命周期（new Map / map.remove），StrictMode 在开发环境下的
// 双次挂载会创建并销毁两个地图实例，容易造成画布闪烁或空白。等 P4 再做完整的
// 生命周期验证后可以考虑开启。
const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 容器');

createRoot(container).render(<App />);
