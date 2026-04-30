import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { WidgetHost } from '@zmeta/ai-board-sdk';
import { StatusPill } from './components/status-pill';

const VISDOC_ID = 'd70cbb4c-4195-4bbc-9922-285022945150';
const TIMEOUT_ORDERS_DATASET_ID = 'dataset-logistics-timeout-orders';
const WAREHOUSE_MAP_MODEL_SRC =
  '/assets/map/extruded-map-models/logistics-china-default/scene.gltf';
const TRANSPORT_CHINA_MAP_WIDGET_ID = 'transport-china-3d-map';
const WAREHOUSE_CHINA_MAP_WIDGET_ID = 'warehouse-china-3d-map';
const VEHICLE_CHINA_MAP_WIDGET_ID = 'vehicle-china-3d-map';
const AI_BOARD_WIDGET_UPDATE_EVENT = 'zmeta-ai-board-widget:update';
const EXCEPTION_AREA_FOCUS_EVENT = 'logistics-exception-area:focus';

type FileDatasetResponse = {
  fields: string[];
  types: string[];
  values: Array<Array<string | number | boolean | null>>;
};

type TimeoutOrder = {
  orderId: string;
  businessType: string;
  route: string;
  vehicleNo: string;
  driver: string;
  eta: string;
  remainingMinutes: number;
  riskReason: string;
  cargoType: string;
  suggestion: string;
};

type TransportMapLayerKey =
  | 'warehouse'
  | 'delivery'
  | 'flyline'
  | 'heatmap'
  | 'warning';
type OverviewHeatKey = 'order' | 'vehicle' | 'exception';

type TransportMapWidgetDefinition = {
  id: string;
  type: string;
  name?: string;
  config?: Record<string, unknown>;
  dataConfig?: Array<{
    datasetId: string;
    fields: Array<Record<string, unknown>>;
    config?: Record<string, unknown>;
    filters?: Array<Record<string, unknown>>;
    sorts?: Array<Record<string, unknown>>;
  }>;
  layout?: Record<string, unknown>;
};

type ExceptionAreaFocusDetail = {
  area?: string;
  lon?: number;
  lat?: number;
};

const transportMapLayerDatasetIds: Record<TransportMapLayerKey, string> = {
  warehouse: 'dataset-logistics-warehouse-map-points',
  delivery: 'dataset-logistics-delivery-map-points',
  flyline: 'dataset-logistics-transport-flylines',
  heatmap: 'dataset-logistics-order-heatmap',
  warning: 'dataset-logistics-exception-alert-areas',
};

const transportMapLayerLabels: Array<{
  key: TransportMapLayerKey;
  label: string;
}> = [
  { key: 'warehouse', label: '全国仓库点位' },
  { key: 'delivery', label: '城市配送点位' },
  { key: 'flyline', label: '全国运输线路飞线' },
  { key: 'heatmap', label: '订单区域热力' },
  { key: 'warning', label: '异常预警点位' },
];

const defaultTransportMapLayerVisibility: Record<
  TransportMapLayerKey,
  boolean
> = {
  warehouse: true,
  delivery: true,
  flyline: true,
  heatmap: true,
  warning: true,
};

const overviewHeatLayerPresets: Record<
  OverviewHeatKey,
  Record<TransportMapLayerKey, boolean>
> = {
  order: {
    warehouse: true,
    delivery: true,
    flyline: false,
    heatmap: true,
    warning: true,
  },
  vehicle: {
    warehouse: false,
    delivery: true,
    flyline: true,
    heatmap: false,
    warning: true,
  },
  exception: {
    warehouse: true,
    delivery: false,
    flyline: true,
    heatmap: true,
    warning: true,
  },
};

const timeoutOrderFallback: TimeoutOrder[] = [
  {
    orderId: 'ORD-928104',
    businessType: '冷链药品',
    route: '上海一仓 -> 南京中转 -> 合肥医院',
    vehicleNo: '沪A-9237',
    driver: '张毅',
    eta: '13:42',
    remainingMinutes: 42,
    riskReason: '绕城高速拥堵，冷链时窗收紧',
    cargoType: '2-8°C 注射制剂',
    suggestion: '优先切换江北快速路，并联系收货端预留卸货口',
  },
  {
    orderId: 'ORD-928223',
    businessType: '生鲜同城',
    route: '广州南仓 -> 白云前置仓 -> 天河门店',
    vehicleNo: '粤B-0619',
    driver: '李卓',
    eta: '13:31',
    remainingMinutes: 31,
    riskReason: '城配站点排队，卸货窗口接近关闭',
    cargoType: '生鲜果蔬',
    suggestion: '前置改派至天河北门店，减少卸货等待',
  },
  {
    orderId: 'ORD-928808',
    businessType: '大件运输',
    route: '武汉中仓 -> 郑州项目现场',
    vehicleNo: '鄂A-4392',
    driver: '周骁',
    eta: '13:24',
    remainingMinutes: 24,
    riskReason: '沿线施工限流，当前速度持续低于阈值',
    cargoType: '工业设备备件',
    suggestion: '通知现场延后吊装窗口，同时安排后备车接力',
  },
];

const pages = [
  {
    key: 'overview',
    label: '运输总览',
    eyebrow: 'TRANSPORT COMMAND',
    title: '全国运输态势总览',
    subtitle: '全国视角 · 订单状态 · 异常区域 · 运输热力',
    chartId: 'order-trend-chart',
  },
  {
    key: 'warehouse',
    label: '仓网线路',
    eyebrow: 'WAREHOUSE NETWORK',
    title: '仓网发运与线路流向',
    subtitle: '仓库发货 · 干线流量 · 延误线路 · 到仓准时率',
    chartId: 'route-volume-chart',
  },
  {
    key: 'vehicle',
    label: '车辆订单',
    eyebrow: 'FLEET DISPATCH',
    title: '车辆在途与订单风险',
    subtitle: '车辆位置 · 超时订单 · 供需缺口 · 异常车辆',
    chartId: 'vehicle-demand-chart',
  },
];

const pageData = {
  overview: {
    metrics: [
      ['今日运输订单数', '28,640', '+12.8%'],
      ['运输中订单数', '8,932', '+6.1%'],
      ['已签收订单数', '17,386', '+9.4%'],
      ['异常订单数', '126', '-18.7%'],
      ['在途车辆数', '3,482', '+4.6%'],
      ['准时率', '96.8%', '+2.1%'],
      ['平均运输时长', '18.6h', '-6.4%'],
      ['总里程', '86.4万 km', '+8.3%'],
      ['全国运输热力', '1,280', '+14.2%'],
      ['异常区域提示', '7', '-3'],
    ],
    leftTitle: '订单状态统计',
    leftList: [
      ['华东大区', '8,420 单', '准时率 98.1%', 'success'],
      ['华南大区', '6,760 单', '异常 18 单', 'warning'],
      ['华北大区', '5,230 单', '在途 1,024 车', 'success'],
      ['西南大区', '3,980 单', '积压 42 单', 'danger'],
    ],
    rightTitle: '异常区域排行',
    rightList: [
      ['成都枢纽', '异常 32 单', '拥堵指数 78', 'danger'],
      ['郑州中转', '异常 25 单', '天气影响', 'warning'],
      ['广州南仓', '异常 19 单', '装卸排队', 'warning'],
      ['苏州园区', '异常 11 单', '道路管制', 'info'],
    ],
    mapStats: [
      '全国仓库点位 86',
      '城市配送点位 214',
      '车辆当前位置 3,482',
      '全国运输线路飞线 1,280',
    ],
  },
  warehouse: {
    metrics: [
      ['仓库总数', '86', '+3'],
      ['发货仓数', '64', '+8.2%'],
      ['总发货量', '21,908', '+11.6%'],
      ['出库完成率', '94.2%', '+1.9%'],
      ['积压订单', '482', '-9.3%'],
      ['线路准时率', '92.7%', '+3.4%'],
    ],
    leftTitle: '仓库发货排行',
    leftList: [
      ['上海一仓', '3,820 件', '库存压力 62%', 'success'],
      ['广州南仓', '3,410 件', '装车 168 台', 'success'],
      ['成都西仓', '2,950 件', '积压 96 单', 'warning'],
      ['武汉中仓', '2,430 件', '延误 12 线', 'danger'],
    ],
    rightTitle: '热门线路监控',
    rightList: [
      ['上海 -> 北京', '1,280 单', '正常', 'success'],
      ['广州 -> 成都', '920 单', '拥堵风险', 'warning'],
      ['武汉 -> 西安', '780 单', '延误 2.4h', 'danger'],
      ['天津 -> 青岛', '640 单', '正常', 'success'],
    ],
    mapStats: ['发运仓 64', '干线飞线 148', '延误线路 12', '热区闪烁 9'],
  },
  vehicle: {
    metrics: [
      ['在途车辆', '3,482', '+4.6%'],
      ['可调度车辆', '1,126', '-2.3%'],
      ['异常车辆', '58', '-14.9%'],
      ['即将超时', '214', '+7.8%'],
      ['已超时订单', '69', '-11.2%'],
      ['平均装载率', '82.4%', '+5.5%'],
    ],
    leftTitle: '车辆状态统计',
    leftList: [
      ['沪A·9237', '上海 -> 北京', '预计 18:30 到达', 'success'],
      ['粤B·0619', '广州 -> 成都', '偏离路线 3.2km', 'danger'],
      ['川A·7285', '成都 -> 重庆', '即将超时', 'warning'],
      ['鄂A·4392', '武汉 -> 西安', '停留过久', 'warning'],
    ],
    rightTitle: '重点订单风险',
    rightList: [
      ['ORD-928104', '冷链药品', '超时 42 分钟', 'danger'],
      ['ORD-928223', '生鲜同城', '距离 12km', 'warning'],
      ['ORD-928516', '工厂备件', '正常推进', 'success'],
      ['ORD-928808', '大件运输', '装载率 96%', 'info'],
    ],
    mapStats: ['实时点位 3,482', '轨迹回放 186', '红色偏离 8', '供需缺口 14'],
  },
} as const;

const mapPoints = [
  { city: '北京', x: 64, y: 26, tone: 'success' },
  { city: '上海', x: 73, y: 55, tone: 'success' },
  { city: '广州', x: 61, y: 78, tone: 'warning' },
  { city: '成都', x: 42, y: 62, tone: 'danger' },
  { city: '武汉', x: 56, y: 57, tone: 'success' },
  { city: '西安', x: 48, y: 45, tone: 'warning' },
  { city: '乌鲁木齐', x: 22, y: 24, tone: 'info' },
];

const routeLines = [
  'route-a',
  'route-b',
  'route-c',
  'route-d',
  'route-e',
  'route-f',
];

const resourcePanels = {
  overview: {
    title: '运营总览',
    summary: [
      ['28,640', '今日运输订单'],
      ['8,932', '运输中订单'],
      ['17,386', '已签收订单'],
    ],
    cards: [
      {
        title: '订单状态',
        subtitle: '今日运输状态摘要',
        stats: [
          ['126', '异常订单'],
          ['3,482', '在途车辆'],
          ['96.8%', '准时率'],
        ],
        note: '红色风险优先调度',
        tone: 'green',
      },
      {
        title: '运输效率',
        subtitle: '平均运输时长 18.6h',
        stats: [
          ['18.6h', '平均时长'],
          ['86.4万', '总里程'],
          ['1,280', '运输热力'],
        ],
        note: '小时订单量持续监控',
        tone: 'blue',
      },
      {
        title: '地图点位',
        subtitle: '全国仓库与城市配送点',
        stats: [
          ['86', '仓库点位'],
          ['214', '配送点位'],
          ['3,482', '车辆位置'],
        ],
        note: '悬浮显示订单/车辆/异常/准时',
        tone: 'red',
      },
      {
        title: '线路热力',
        subtitle: '全国运输线路飞线',
        stats: [
          ['1,280', '飞线'],
          ['7', '异常区域'],
          ['动态', '密集闪烁'],
        ],
        note: '按订单量展示区域热力',
        tone: 'yellow',
      },
    ],
  },
  warehouse: {
    title: '仓网资源概览',
    summary: [
      ['86', '仓库总数'],
      ['64', '发货仓'],
      ['482', '积压订单'],
    ],
    cards: [
      {
        title: '发货仓群',
        subtitle: '今日发货量 21,908',
        stats: [
          ['64', '发货仓'],
          ['94.2%', '出库率'],
          ['3,820', '最高'],
        ],
        note: '上海一仓发货量领先',
        tone: 'green',
      },
      {
        title: '干线流向',
        subtitle: '仓到城线路 148',
        stats: [
          ['148', '飞线'],
          ['12', '延误'],
          ['92.7%', '准时'],
        ],
        note: '武西线存在延误风险',
        tone: 'blue',
      },
      {
        title: '库存压力',
        subtitle: '积压订单 482',
        stats: [
          ['96', '成都'],
          ['62%', '上海'],
          ['12', '延误线'],
        ],
        note: '西南仓网压力上升',
        tone: 'red',
      },
      {
        title: '热门线路',
        subtitle: '沪京线 1,280 单',
        stats: [
          ['1,280', '沪京'],
          ['920', '粤蓉'],
          ['780', '武西'],
        ],
        note: '重点监控拥堵线路',
        tone: 'yellow',
      },
    ],
  },
  vehicle: {
    title: '运输资源概览',
    summary: [
      ['1,126', '空闲车辆'],
      ['3,482', '在途车辆'],
      ['58', '异常车辆'],
    ],
    cards: [
      {
        title: '城配车辆',
        subtitle: '同城配送订单 12,486',
        stats: [
          ['642', '可调度'],
          ['18', '异常'],
          ['96.8%', '准时率'],
        ],
        note: '平均响应：18 分钟',
        tone: 'green',
      },
      {
        title: '干线车辆',
        subtitle: '跨城在途车辆 1,904',
        stats: [
          ['1,904', '在途'],
          ['96', '即将超时'],
          ['86.2%', '装载率'],
        ],
        note: '重点线路：沪京 / 粤蓉',
        tone: 'blue',
      },
      {
        title: '冷链车辆',
        subtitle: '温控重点订单 214',
        stats: [
          ['214', '重点订单'],
          ['69', '已超时'],
          ['7', '温控异常'],
        ],
        note: '风险批次优先调度',
        tone: 'red',
      },
      {
        title: '仓配协同',
        subtitle: '发货仓 64 · 覆盖城市 214',
        stats: [
          ['64', '发货仓'],
          ['482', '积压'],
          ['14', '缺口'],
        ],
        note: '华南与西南需补车',
        tone: 'yellow',
      },
    ],
  },
} as const;

function HeaderSvgFrame() {
  return (
    <svg
      className="topbar-frame"
      viewBox="0 0 1922 92"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="headerOuter" x1="0" y1="0" x2="1922" y2="92">
          <stop offset="0" stopColor="#050912" stopOpacity="0.98" />
          <stop offset="0.45" stopColor="#0C1424" stopOpacity="0.86" />
          <stop offset="1" stopColor="#050912" stopOpacity="0.98" />
        </linearGradient>
        <linearGradient id="headerWash" x1="0" y1="0" x2="1922" y2="0">
          <stop offset="0" stopColor="#15345C" stopOpacity="0.34" />
          <stop offset="0.26" stopColor="#1A3760" stopOpacity="0.1" />
          <stop offset="0.66" stopColor="#162A49" stopOpacity="0.12" />
          <stop offset="1" stopColor="#0B1320" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="headerHot" x1="700" y1="0" x2="1230" y2="0">
          <stop offset="0" stopColor="#F2A23A" stopOpacity="0" />
          <stop offset="0.5" stopColor="#F2A23A" stopOpacity="0.44" />
          <stop offset="1" stopColor="#F2A23A" stopOpacity="0" />
        </linearGradient>
        <filter id="headerGlow" x="-5%" y="-80%" width="110%" height="260%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width="1922" height="92" fill="url(#headerOuter)" />
      <rect x="0" y="0" width="1922" height="92" fill="url(#headerWash)" />
      <path
        d="M0 0H1922"
        stroke="#2D8DFF"
        strokeOpacity="0.54"
        strokeWidth="2"
      />
      <path
        d="M0 76H1922"
        stroke="#8796A5"
        strokeOpacity="0.24"
        strokeWidth="1"
      />
      <path
        d="M0 87H88"
        stroke="#2D8DFF"
        strokeOpacity="0.82"
        strokeWidth="2"
      />
      <path
        d="M1834 87H1912"
        stroke="#2D8DFF"
        strokeOpacity="0.72"
        strokeWidth="2"
      />
      <path
        d="M30 50H210"
        stroke="#CBD5DF"
        strokeOpacity="0.22"
        strokeWidth="1"
      />
      <path
        d="M542 48H690"
        stroke="#CBD5DF"
        strokeOpacity="0.72"
        strokeWidth="1.4"
      />
      <path
        d="M1236 48H1384"
        stroke="#CBD5DF"
        strokeOpacity="0.72"
        strokeWidth="1.4"
      />
      <g opacity="0.34">
        <path d="M704 38H709L700 58H695L704 38Z" fill="#AEB9C3" />
        <path d="M716 38H721L712 58H707L716 38Z" fill="#AEB9C3" />
        <path d="M728 38H733L724 58H719L728 38Z" fill="#AEB9C3" />
        <path d="M1189 38H1194L1185 58H1180L1189 38Z" fill="#AEB9C3" />
        <path d="M1201 38H1206L1197 58H1192L1201 38Z" fill="#AEB9C3" />
        <path d="M1213 38H1218L1209 58H1204L1213 38Z" fill="#AEB9C3" />
      </g>
      <g filter="url(#headerGlow)">
        <path d="M0 0H14L0 30V0Z" fill="#2D8DFF" opacity="0.48" />
        <path
          d="M24 87H92"
          stroke="#2D8DFF"
          strokeOpacity="0.64"
          strokeWidth="2"
        />
        <circle cx="900" cy="48" r="2" fill="#CED8E2" opacity="0.55" />
        <circle cx="978" cy="48" r="2" fill="#CED8E2" opacity="0.46" />
        <circle cx="1056" cy="48" r="2" fill="#CED8E2" opacity="0.38" />
      </g>
    </svg>
  );
}

export default function Board() {
  const [activeKey, setActiveKey] =
    useState<(typeof pages)[number]['key']>('overview');
  const [isMapStageReady, setIsMapStageReady] = useState(false);
  const activePage = useMemo(
    () => pages.find((page) => page.key === activeKey) ?? pages[0],
    [activeKey]
  );
  const data = pageData[activePage.key as keyof typeof pageData];

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsMapStageReady(true);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsMapStageReady(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <main className="logistics-screen">
      <div
        className={
          activeKey === 'vehicle'
            ? 'screen-grid screen-grid-vehicle'
            : `screen-grid screen-grid-${activeKey}`
        }
      >
        <header className="topbar">
          <HeaderSvgFrame />
          <div className="header-brand">
            <span className="header-mascot" aria-hidden="true" />
            <div className="header-title-copy">
              <h1>物流运输智能调度系统</h1>
              <span>Intelligent logistics monitoring platform</span>
            </div>
          </div>
          <nav className="page-tabs" aria-label="调度页面切换">
            {pages.map((page) => (
              <button
                key={page.key}
                className={
                  page.key === activeKey
                    ? 'page-tab page-tab-active'
                    : 'page-tab'
                }
                type="button"
                onClick={() => setActiveKey(page.key)}
              >
                {page.label}
              </button>
            ))}
          </nav>
          <div className="header-status">
            <div className="status-gauge status-gauge-temp">
              <i aria-hidden="true" />
              <div>
                <span>Cloudy&nbsp;&nbsp;22°C</span>
                <em>运输气象</em>
              </div>
            </div>
            <div className="status-gauge status-gauge-time">
              <div>
                <strong>12:00:00</strong>
                <em>2026/04/29</em>
              </div>
            </div>
          </div>
        </header>

        {isMapStageReady ? (
          <PersistentChinaMapStage activeKey={activeKey} />
        ) : null}

        {activeKey === 'vehicle' ? (
          <VehicleOrderView />
        ) : activeKey === 'overview' ? (
          <OverviewMonitorView />
        ) : activeKey === 'warehouse' ? (
          <WarehouseMonitorView />
        ) : (
          <>
            <section className="kpi-strip" aria-label="核心运输指标">
              {data.metrics.map(([label, value, trend]) => (
                <article className="kpi-card" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <em>{trend}</em>
                </article>
              ))}
            </section>

            <section className={`main-layout main-layout-${activeKey}`}>
              <aside className="resource-side">
                <ResourceConsolePanel
                  panel={
                    resourcePanels[activePage.key as 'overview' | 'warehouse']
                  }
                />
              </aside>

              <section
                className={
                  activeKey === 'overview'
                    ? 'center-stack center-stack-overview'
                    : 'center-stack'
                }
              >
                <section className="map-panel">
                  <div className="map-header">
                    <div>
                      <span className="eyebrow">3D CHINA LOGISTICS MAP</span>
                      <h2>{activePage.title}</h2>
                    </div>
                    <div className="map-legend">
                      <span>正常</span>
                      <span>拥堵</span>
                      <span>异常</span>
                    </div>
                  </div>

                  <div className="china-map" aria-label="中国物流三维态势地图">
                    <div className="china-shape" />
                    <div className="heat-zone heat-zone-one" />
                    <div className="heat-zone heat-zone-two" />
                    <div className="heat-zone heat-zone-three" />
                    {routeLines.map((line) => (
                      <i className={`route-line ${line}`} key={line} />
                    ))}
                    {mapPoints.map((point) => (
                      <button
                        className={`map-point map-point-${point.tone}`}
                        key={point.city}
                        style={{ left: `${point.x}%`, top: `${point.y}%` }}
                        type="button"
                        title={`${point.city}：点击查看订单、车辆、异常情况`}
                      >
                        <span>{point.city}</span>
                      </button>
                    ))}
                    <div className="map-callout">
                      <b>扩散预警</b>
                      <span>预计 T+32 分钟出现线路拥堵风险</span>
                    </div>
                  </div>

                  <div className="map-footer">
                    {data.mapStats.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>

                  {activeKey === 'overview' ? (
                    <div className="overview-trend-floating">
                      <Panel
                        title="今日运输趋势 / 小时订单量变化"
                        marker="TREND"
                      >
                        <WidgetHost
                          id="order-trend-chart"
                          className="overview-trend-host"
                        />
                      </Panel>
                    </div>
                  ) : null}
                </section>
              </section>

              <aside className="side-stack compact-side">
                <Panel title={data.rightTitle} marker="RISK">
                  <div className="status-list">
                    {data.rightList.map(([name, value, desc, tone], index) => (
                      <div
                        className={`status-row status-row-${tone}`}
                        key={name}
                      >
                        <i>{String(index + 1).padStart(2, '0')}</i>
                        <div>
                          <strong>{name}</strong>
                          <span>{desc}</span>
                        </div>
                        <em>{value}</em>
                      </div>
                    ))}
                  </div>
                </Panel>

                {activeKey === 'overview' ? null : (
                  <Panel title="趋势监控" marker="CHART">
                    <WidgetHost
                      id={activePage.chartId}
                      className="chart-host"
                    />
                  </Panel>
                )}
              </aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const overviewServiceBars = [
  ['12月', 44],
  ['1月', 44],
  ['2月', 50],
  ['3月', 74],
  ['4月', 100],
  ['5月', 68],
  ['6月', 88],
  ['7月', 59],
  ['8月', 94],
  ['9月', 28],
  ['10月', 40],
  ['11月', 80],
] as const;

const overviewSavingBars = [
  ['2022', '40,655 / 万元', 100],
  ['2021', '30,555 / 万元', 74],
  ['2020', '28,555 / 万元', 68],
  ['2019', '23,355 / 万元', 55],
] as const;

const overviewWarningRows = [
  ['LF2209184513000012', '延迟', 'Z0424', '待解决', 'hot'],
  ['LF2209184513000012', '延迟', 'Z0424', '解决中', 'warn'],
  ['LF2209184513000012', '丢损', 'Z0424', '已解决', 'done'],
  ['LF2209184513000012', '断货', 'Z0424', '已解决', 'done'],
  ['LF2209184513000012', '延迟', 'Z0424', '解决中', 'warn'],
  ['LF2209184513000012', '延迟', 'Z0424', '待解决', 'hot'],
] as const;

const overviewRiskRanks = [
  ['1', '深圳欧美森国际物流有限公司', '高风险', '合作中', '1.0'],
  ['2', '杭州乐众国际物流有限公司', '低风险', '合作中', '1.2'],
  ['3', '明洋启航供应链有限公司', '低风险', '合作中', '1.3'],
  ['4', '杭州乐众国际物流有限公司', '低风险', '合作中', '1.8'],
  ['5', '欧豪森国际物流有限公司', '低风险', '未合作', '2.0'],
] as const;

type OverviewDetail = {
  title: string;
  items: Array<[string, string]>;
};

type WarehouseMapShape = {
  className: string;
  d: string;
};

const fallbackChinaMapShapes: WarehouseMapShape[] = [
  {
    className: 'warehouse-map-region transport-china-mainland',
    d: 'M168 268L220 218L304 196L386 150L482 172L536 138L624 166L692 214L786 222L844 286L796 346L742 348L714 402L640 414L604 468L512 448L456 492L366 462L314 500L244 456L198 382L124 356L112 304Z',
  },
  {
    className: 'warehouse-map-region transport-china-northeast',
    d: 'M626 166L704 126L784 146L844 206L786 222L692 214Z',
  },
  {
    className: 'warehouse-map-region transport-china-south',
    d: 'M362 466L436 492L464 536L406 562L342 536Z',
  },
  {
    className: 'warehouse-map-risk-route',
    d: 'M218 326L314 304L442 294L558 274L680 292L782 330L772 344L660 314L550 296L438 316L318 326L226 346Z',
  },
  {
    className: 'warehouse-map-route',
    d: 'M284 416L386 374L496 356L614 378L704 430L688 446L604 402L498 382L398 398L300 438Z',
  },
];

type WarehouseCoreDetail = {
  title: string;
  total: string;
  unit: string;
  summary: string;
  items: Array<[string, string]>;
  records: Array<[string, string, string, string]>;
};

const warehouseCoreDetails: Record<string, WarehouseCoreDetail> = {
  total: {
    title: '仓库总数',
    total: '86',
    unit: '座',
    summary: '全国仓网覆盖 7 个大区，核心枢纽仓 18 座，前置仓 42 座。',
    items: [
      ['核心枢纽仓', '18座'],
      ['区域分拨仓', '26座'],
      ['城市前置仓', '42座'],
      ['今日在线仓', '82座'],
    ],
    records: [
      ['上海一仓', '华东', '核心枢纽', '在线'],
      ['广州南仓', '华南', '区域分拨', '在线'],
      ['成都西仓', '西南', '区域分拨', '在线'],
      ['武汉中仓', '华中', '核心枢纽', '在线'],
      ['北京北仓', '华北', '城市前置', '在线'],
    ],
  },
  active: {
    title: '今日发货仓',
    total: '64',
    unit: '座',
    summary: '今日有发运记录的仓库 64 座，主要集中在华东、华南和成渝干线。',
    items: [
      ['已完成出库', '52座'],
      ['正在装车', '9座'],
      ['等待集货', '3座'],
      ['最高发货量', '3,820件'],
    ],
    records: [
      ['上海一仓', '3,820件', '168车次', '正常'],
      ['广州南仓', '3,410件', '142车次', '正常'],
      ['成都西仓', '2,950件', '96车次', '排队'],
      ['武汉中仓', '2,430件', '88车次', '延误'],
      ['苏州园区', '1,980件', '72车次', '正常'],
    ],
  },
  backlog: {
    title: '积压订单',
    total: '482',
    unit: '单',
    summary: '积压订单主要来自月台排队、分拨延迟和干线车辆缺口，需优先处理西南与华中仓。',
    items: [
      ['成都西仓', '96单'],
      ['武汉中仓', '84单'],
      ['广州南仓', '72单'],
      ['超 2 小时', '138单'],
    ],
    records: [
      ['ORD-928104', '成都西仓', '冷链药品', '月台排队 42min'],
      ['ORD-928223', '广州南仓', '生鲜同城', '车辆缺口 31min'],
      ['ORD-928516', '武汉中仓', '工厂备件', '分拨延迟 28min'],
      ['ORD-928808', '成都西仓', '大件运输', '装车等待 24min'],
      ['ORD-929012', '郑州中转', '电商包裹', '干线晚到 19min'],
      ['ORD-929076', '苏州园区', '医药器械', '查验等待 16min'],
    ],
  },
};

const overviewHeatTabs = [
  ['order', '订单热力'],
  ['vehicle', '在途车辆'],
  ['exception', '异常区域'],
] as const;

const overviewHeatWidgetIds = {
  order: 'transport-heat-order-chart',
  vehicle: 'transport-heat-vehicle-chart',
  exception: 'transport-heat-exception-chart',
} as const;

const overviewTrendTabs = [
  ['duration', '平均运输时长'],
  ['mileage', '总里程'],
  ['ontime', '准时率'],
  ['exception', '异常订单'],
] as const;

const overviewTrendWidgetIds = {
  duration: 'transport-efficiency-today-duration-chart',
  mileage: 'transport-efficiency-today-mileage-chart',
  ontime: 'transport-efficiency-today-ontime-chart',
  exception: 'transport-efficiency-today-exception-chart',
} as const;

function resolvePreviewVisdocId() {
  if (typeof window === 'undefined') {
    return VISDOC_ID;
  }

  const match = window.location.pathname.match(
    /\/api\/visdocs\/([^/]+)\/ai-board-preview(?:\/|$)/
  );
  return match ? decodeURIComponent(match[1]) : VISDOC_ID;
}

function withTransportMapLayerVisibility(
  widget: TransportMapWidgetDefinition,
  visibility: Record<TransportMapLayerKey, boolean>
): TransportMapWidgetDefinition {
  return {
    ...widget,
    dataConfig: (widget.dataConfig ?? []).map((layer) => {
      const layerKey = transportMapLayerLabels.find(
        (item) => transportMapLayerDatasetIds[item.key] === layer.datasetId
      )?.key;

      if (!layerKey) {
        return layer;
      }

      return {
        ...layer,
        config: {
          ...(layer.config ?? {}),
          visible: visibility[layerKey],
        },
      };
    }),
  };
}

function withTransportMapFocusCommand(
  widget: TransportMapWidgetDefinition,
  detail: Required<Pick<ExceptionAreaFocusDetail, 'lon' | 'lat'>>
): TransportMapWidgetDefinition {
  return {
    ...widget,
    config: {
      ...(widget.config ?? {}),
      runtimeCameraCommand: {
        type: 'fly-to',
        commandId: `exception-area-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        issuedAt: Date.now(),
        lon: detail.lon,
        lat: detail.lat,
        targetOffsetLon: 1.6,
        targetOffsetLat: -0.6,
        cameraDistance: 1150,
        pullBackDistance: 2500,
        durationMs: 1600,
        pullBackDurationMs: 480,
        pushInDurationMs: 1120,
      },
    },
  };
}

function postTransportMapWidgetUpdate(
  widget: TransportMapWidgetDefinition,
  options: { replay?: boolean } = {}
) {
  if (typeof window === 'undefined') {
    return;
  }

  const postUpdate = () => {
    window.postMessage(
      {
        type: AI_BOARD_WIDGET_UPDATE_EVENT,
        visdocId: resolvePreviewVisdocId(),
        widget,
      },
      window.location.origin
    );
  };

  postUpdate();

  if (options.replay) {
    window.requestAnimationFrame(postUpdate);
    [160, 500, 1000].forEach((delay) => {
      window.setTimeout(postUpdate, delay);
    });
  }
}

const transportKpiCards = [
  {
    id: 'transport-kpi-orders-today',
    trendId: 'transport-kpi-trend-orders-today',
    label: '今日运输订单数',
    unit: '单',
    trendTone: 'up',
  },
  {
    id: 'transport-kpi-in-transit',
    trendId: 'transport-kpi-trend-in-transit',
    label: '运输中订单数',
    unit: '单',
    trendTone: 'up',
  },
  {
    id: 'transport-kpi-signed-orders',
    trendId: 'transport-kpi-trend-signed-orders',
    label: '已签收订单数',
    unit: '单',
    trendTone: 'up',
  },
  {
    id: 'transport-kpi-exception-orders',
    trendId: 'transport-kpi-trend-exception-orders',
    label: '异常订单数',
    unit: '单',
    trendTone: 'down',
  },
] as const;

const transportRegionKpiCards = [
  {
    id: 'transport-region-kpi-east',
    region: '华东',
    unit: '单',
  },
  {
    id: 'transport-region-kpi-south',
    region: '华南',
    unit: '单',
  },
  {
    id: 'transport-region-kpi-north',
    region: '华北',
    unit: '单',
  },
  {
    id: 'transport-region-kpi-southwest',
    region: '西南',
    unit: '单',
  },
] as const;

const transportBottomKpiCards = [
  {
    id: 'transport-bottom-kpi-active-vehicles',
    unitId: 'transport-bottom-unit-active-vehicles',
    labelId: 'transport-bottom-label-active-vehicles',
    label: '在途车辆数',
    unit: '/ 辆',
  },
  {
    id: 'transport-bottom-kpi-average-duration',
    unitId: 'transport-bottom-unit-average-duration',
    labelId: 'transport-bottom-label-average-duration',
    label: '平均运输时长',
    unit: '/ h',
  },
  {
    id: 'transport-bottom-kpi-total-mileage',
    unitId: 'transport-bottom-unit-total-mileage',
    labelId: 'transport-bottom-label-total-mileage',
    label: '总里程',
    unit: '/ 万km',
  },
] as const;

const transportExceptionSummaryCards = [
  {
    id: 'transport-exception-summary-area-kpi',
    label: '异常区域',
    unit: '/处',
  },
  {
    id: 'transport-exception-summary-transit-kpi',
    label: '运输中订单',
    unit: '/单',
  },
  {
    id: 'transport-exception-summary-signed-kpi',
    label: '已签收订单',
    unit: '/单',
  },
  {
    id: 'transport-exception-summary-heat-kpi',
    label: '全国运输热力',
    unit: '/线',
  },
] as const;

function OverviewMonitorView() {
  const [selectedOverviewDetail, setSelectedOverviewDetail] =
    useState<OverviewDetail | null>(null);
  const [activeHeatKey, setActiveHeatKey] =
    useState<(typeof overviewHeatTabs)[number][0]>('order');
  const [activeTrendKey, setActiveTrendKey] =
    useState<(typeof overviewTrendTabs)[number][0]>('duration');
  const [transportMapWidget, setTransportMapWidget] =
    useState<TransportMapWidgetDefinition | null>(null);
  const [transportMapLayerVisibility, setTransportMapLayerVisibility] =
    useState<Record<TransportMapLayerKey, boolean>>(
      defaultTransportMapLayerVisibility
    );
  const [isTransportLayerPanelCollapsed, setIsTransportLayerPanelCollapsed] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTransportMapWidget() {
      try {
        const response = await fetch('./widgets.json', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const manifest = (await response.json()) as {
          widgets?: TransportMapWidgetDefinition[];
        };
        const widget = manifest.widgets?.find(
          (item) => item.id === TRANSPORT_CHINA_MAP_WIDGET_ID
        );

        if (!cancelled && widget) {
          setTransportMapWidget(widget);
        }
      } catch {
        // 图层联动失败时不影响大屏主体渲染。
      }
    }

    void loadTransportMapWidget();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!transportMapWidget) {
      return;
    }

    postTransportMapWidgetUpdate(
      withTransportMapLayerVisibility(
        transportMapWidget,
        transportMapLayerVisibility
      ),
      { replay: true }
    );
  }, [transportMapLayerVisibility, transportMapWidget]);

  useEffect(() => {
    if (!transportMapWidget || typeof window === 'undefined') {
      return;
    }

    const handleExceptionAreaFocus = (event: Event) => {
      const detail = (event as CustomEvent<ExceptionAreaFocusDetail>).detail;
      const lon = Number(detail?.lon);
      const lat = Number(detail?.lat);

      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return;
      }

      const nextVisibility = {
        ...transportMapLayerVisibility,
        warning: true,
        heatmap: true,
      };

      setActiveHeatKey('exception');
      setTransportMapLayerVisibility(nextVisibility);
      postTransportMapWidgetUpdate(
        withTransportMapFocusCommand(
          withTransportMapLayerVisibility(transportMapWidget, nextVisibility),
          { lon, lat }
        )
      );
    };

    window.addEventListener(
      EXCEPTION_AREA_FOCUS_EVENT,
      handleExceptionAreaFocus
    );

    return () => {
      window.removeEventListener(
        EXCEPTION_AREA_FOCUS_EVENT,
        handleExceptionAreaFocus
      );
    };
  }, [transportMapLayerVisibility, transportMapWidget]);

  const handleHeatTabClick = (key: (typeof overviewHeatTabs)[number][0]) => {
    setActiveHeatKey(key);
    setTransportMapLayerVisibility(overviewHeatLayerPresets[key]);
  };

  const toggleTransportMapLayer = (key: TransportMapLayerKey) => {
    setTransportMapLayerVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <>
    <section
      className="overview-monitor transport-overview-monitor"
      aria-label="运输总览监测平台"
    >
      <div className="overview-city-bg" aria-hidden="true">
        <span className="city-road city-road-a" />
        <span className="city-road city-road-b" />
        <span className="city-road city-road-c" />
        <span className="city-core" />
      </div>

      <aside className="overview-left">
        <OverviewPanel title="核心数据展示" sub="CORE DATA PRESENTATION">
          <div className="core-metric-grid transport-core-grid">
            <div className="transport-kpi-widget-grid">
              {transportKpiCards.map((card) => (
                <article className="transport-kpi-card-shell" key={card.id}>
                  <span>{card.label}</span>
                  <div className="transport-kpi-value-line">
                    <WidgetHost
                      id={card.id}
                      className="transport-kpi-widget-host"
                    />
                    <small>{card.unit}</small>
                  </div>
                  <em
                    className={
                      card.trendTone === 'down' ? 'metric-down' : 'metric-up'
                    }
                  >
                    <WidgetHost
                      id={card.trendId}
                      className="transport-kpi-trend-widget-host"
                    />
                  </em>
                </article>
              ))}
            </div>
            <div className="saving-bars transport-region-kpi-list">
              <b>今日运输状态摘要</b>
              {transportRegionKpiCards.map((card) => (
                <article className="transport-region-kpi-card" key={card.id}>
                  <span>{card.region}</span>
                  <WidgetHost
                    id={card.id}
                    className="transport-region-kpi-widget-host"
                  />
                  <small>{card.unit}</small>
                </article>
              ))}
            </div>
          </div>
        </OverviewPanel>

        <OverviewPanel title="全国运输热力" sub="NATIONAL TRANSPORT HEAT">
          <div className="overview-tabs">
            {overviewHeatTabs.map(([key, label]) => (
              <button
                className={key === activeHeatKey ? 'overview-tab-active' : ''}
                key={key}
                type="button"
                onClick={() => handleHeatTabClick(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <WidgetHost
            id={overviewHeatWidgetIds[activeHeatKey]}
            key={overviewHeatWidgetIds[activeHeatKey]}
            className="service-bar-chart overview-heat-widget-host"
          />
        </OverviewPanel>

        <OverviewPanel title="运输效率趋势" sub="DURATION AND MILEAGE">
          <div className="overview-tabs overview-trend-tabs">
            {overviewTrendTabs.map(([key, label]) => (
              <button
                className={key === activeTrendKey ? 'overview-tab-active' : ''}
                key={key}
                type="button"
                onClick={() => setActiveTrendKey(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <WidgetHost
            id={overviewTrendWidgetIds[activeTrendKey]}
            key={overviewTrendWidgetIds[activeTrendKey]}
            className="shortage-line-chart overview-trend-widget-host"
          />
        </OverviewPanel>
      </aside>

      <div
        className={`overview-map-layer-legend${
          isTransportLayerPanelCollapsed ? ' is-collapsed' : ''
        }`}
        aria-label="地图图层控制"
      >
        <button
          aria-expanded={!isTransportLayerPanelCollapsed}
          className="overview-map-layer-collapse"
          type="button"
          onClick={() =>
            setIsTransportLayerPanelCollapsed((current) => !current)
          }
        >
          {isTransportLayerPanelCollapsed ? '图层' : '收起'}
        </button>
        {!isTransportLayerPanelCollapsed ? (
          <div className="overview-map-layer-list">
            {transportMapLayerLabels.map((item) => (
              <button
                aria-pressed={transportMapLayerVisibility[item.key]}
                className={`overview-map-layer-toggle overview-map-layer-${item.key}`}
                key={item.key}
                type="button"
                onClick={() => toggleTransportMapLayer(item.key)}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <section className="overview-center">
        <div className="overview-map-glow">
          <i className="overview-pin overview-pin-a" />
          <i className="overview-pin overview-pin-b" />
          <i className="overview-pin overview-pin-c" />
          <div className="overview-callout">
            <h3>全国运输态势总览</h3>
            <p>
              今日订单 <b>28,640</b>　在途车辆 <b>3,482</b>　准时率{' '}
              <strong>96.8%</strong>
            </p>
            <span>全国运输热力 1,280 · 异常区域提示 7 处</span>
          </div>
        </div>
        <div className="overview-bottom-metrics">
          {transportBottomKpiCards.map((card) => (
            <div className="overview-bottom-kpi-card" key={card.id}>
              <WidgetHost
                id={card.id}
                className="overview-bottom-kpi-widget-host"
              />
              <WidgetHost
                id={card.unitId}
                className="overview-bottom-unit-text-host"
              />
              <WidgetHost
                id={card.labelId}
                className="overview-bottom-label-text-host"
              />
            </div>
          ))}
        </div>
      </section>

      <aside className="overview-right">
        <OverviewPanel title="异常区域提示" sub="EXCEPTION AREA ALERT">
          <div className="warning-top">
            <WidgetHost
              id="transport-exception-ring-chart"
              className="warning-ring-widget-host"
            />
            <div className="warning-types">
              {transportExceptionSummaryCards.map((card) => (
                <article className="warning-type-card" key={card.id}>
                  <span>{card.label}</span>
                  <div className="warning-type-value">
                    <WidgetHost
                      id={card.id}
                      className="warning-type-widget-host"
                    />
                    <small>{card.unit}</small>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <WidgetHost
            id="transport-exception-area-table-chart"
            className="warning-table-widget-host"
          />
        </OverviewPanel>

        <OverviewPanel
          title="今日运输状态摘要"
          sub="TRANSPORT STATUS SUMMARY"
        >
          <WidgetHost
            id="transport-status-summary-chart"
            className="risk-rank-widget-host"
          />
        </OverviewPanel>
      </aside>
    </section>
    {selectedOverviewDetail ? (
      <button
        aria-label="关闭详情"
        className="timeout-modal-backdrop"
        type="button"
        onClick={() => setSelectedOverviewDetail(null)}
      >
        <section
          aria-label={selectedOverviewDetail.title}
          className="timeout-modal overview-detail-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="timeout-modal-head">
            <div>
              <span>运输总览详情</span>
              <h3>{selectedOverviewDetail.title}</h3>
            </div>
          </div>
          <div className="timeout-modal-grid overview-detail-grid">
            {selectedOverviewDetail.items.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </button>
    ) : null}
    </>
  );
}

function WarehouseMonitorView() {
  const [selectedWarehouseDetail, setSelectedWarehouseDetail] =
    useState<WarehouseCoreDetail | null>(null);

  return (
    <>
      <section
        className="overview-monitor warehouse-monitor"
        aria-label="仓网线路监测平台"
      >
        <WarehouseMapBackdrop />
        <div className="overview-city-bg" aria-hidden="true">
          <span className="city-road city-road-a" />
          <span className="city-road city-road-b" />
          <span className="city-road city-road-c" />
          <span className="city-core" />
        </div>

      <aside className="overview-left">
        <OverviewPanel title="仓网核心数据" sub="WAREHOUSE CORE DATA">
          <div className="warehouse-core-board">
            <div className="warehouse-core-headline">
              <div>
                <span>总发货量</span>
                <strong>21,908<small>件</small></strong>
              </div>
              <i />
              <div>
                <span>出库完成率</span>
                <strong>94.2<small>%</small></strong>
              </div>
            </div>
            <div className="warehouse-core-status">
              {[
                ['仓库总数', '86', '座', 'normal', 'total'],
                ['今日发货仓', '64', '座', 'active', 'active'],
                ['积压订单', '482', '单', 'risk', 'backlog'],
              ].map(([label, value, unit, tone, detailKey]) => (
                <button
                  className={`warehouse-core-pill warehouse-core-${tone}`}
                  key={label}
                  type="button"
                  onClick={() =>
                    setSelectedWarehouseDetail(warehouseCoreDetails[detailKey])
                  }
                >
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <em>{unit}</em>
                </button>
              ))}
            </div>
            <div className="warehouse-throughput-list">
              <b>仓库吞吐排行</b>
              {[
                ['上海一仓', '3,820件', 94],
                ['广州南仓', '3,410件', 86],
                ['成都西仓', '2,950件', 74],
                ['武汉中仓', '2,430件', 68],
              ].map(([warehouse, value, width]) => (
                <div className="warehouse-throughput-row" key={warehouse}>
                  <span>{warehouse}</span>
                  <i>
                    <em style={{ width: `${width}%` }} />
                  </i>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </OverviewPanel>

        <OverviewPanel title="热门运输线路 TOP" sub="HOT ROUTE TOP">
          <div className="warehouse-route-sankey">
            {[
              ['上海一仓', '北京北仓', '沪京线', '1,280单', 96],
              ['广州南仓', '成都西仓', '粤蓉线', '920单', 82],
              ['武汉中仓', '西安北仓', '武西线', '780单', 72],
              ['天津港区', '青岛城配', '津青线', '640单', 68],
              ['苏州园区', '杭州前置仓', '苏杭线', '590单', 62],
              ['重庆油北', '昆明城配', '渝昆线', '540单', 56],
              ['郑州中转', '济南北仓', '郑济线', '486单', 52],
              ['成都西仓', '贵阳南仓', '成贵线', '438单', 48],
              ['南昌中仓', '福州前置仓', '赣闽线', '396单', 44],
              ['沈阳北仓', '长春城配', '沈长线', '352单', 40],
              ['厦门港区', '泉州分拨', '厦泉线', '318单', 36],
              ['兰州中仓', '西宁城配', '兰青线', '286单', 32],
            ].map(([from, to, route, value, width], index) => (
              <div className="warehouse-route-flow-row" key={route}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>{from}</span>
                <i>
                  <em style={{ width: `${width}%` }} />
                </i>
                <span>{to}</span>
                <small>{route}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </OverviewPanel>

        <OverviewPanel title="延误线路 TOP" sub="DELAY ROUTE TOP">
          <div className="warehouse-delay-bubbles">
            {[
              ['武西线', '2.4h', '施工', 88, 'hot'],
              ['粤蓉线', '1.8h', '拥堵', 74, 'warn'],
              ['郑兰线', '1.5h', '天气', 66, 'warn'],
              ['苏杭线', '1.2h', '装卸', 52, 'normal'],
              ['渝昆线', '0.9h', '绕行', 44, 'normal'],
            ].map(([route, delay, reason, size, tone]) => (
              <div
                className={`warehouse-delay-bubble warehouse-delay-${tone}`}
                key={route}
                style={{ '--size': `${size}px` } as React.CSSProperties}
              >
                <strong>{delay}</strong>
                <span>{route}</span>
                <em>{reason}</em>
              </div>
            ))}
          </div>
        </OverviewPanel>
      </aside>

      <section className="overview-center">
        <div className="warehouse-flow-map">
          <div className="overview-callout">
            <h3>仓网发运与线路流向</h3>
            <p>
              发运仓 <b>64座</b>　干线 <b>148条</b>　准时率{' '}
              <strong>92.7%</strong>
            </p>
            <span>仓到仓 / 仓到城流向实时监控</span>
          </div>
          {[
            ['上海一仓', '68%', '24%', 'warehouse-node-east'],
            ['广州南仓', '58%', '68%', 'warehouse-node-south'],
            ['成都西仓', '33%', '58%', 'warehouse-node-west'],
            ['武汉中仓', '49%', '48%', 'warehouse-node-center'],
            ['北京北仓', '61%', '25%', 'warehouse-node-north'],
          ].map(([name, left, top, className]) => (
            <span
              className={`warehouse-flow-node ${className}`}
              key={name}
              style={{ left, top }}
            >
              {name}
            </span>
          ))}
          <i className="warehouse-flow-line warehouse-flow-a" />
          <i className="warehouse-flow-line warehouse-flow-b" />
          <i className="warehouse-flow-line warehouse-flow-c" />
          <i className="warehouse-flow-line warehouse-flow-d" />
        </div>
        <div className="overview-bottom-metrics">
          <div>
            <strong>21,908</strong>
            <span>/ 件</span>
            <em>总发货量</em>
          </div>
          <div>
            <strong>148</strong>
            <span>/ 条</span>
            <em>干线飞线</em>
          </div>
          <div>
            <strong>12</strong>
            <span>/ 条</span>
            <em>延误线路</em>
          </div>
        </div>
      </section>

      <aside className="overview-right">
        <OverviewPanel title="线路准时率" sub="ROUTE ON-TIME RATE">
          <div className="warehouse-rate-bar-chart">
            <div className="warehouse-chart-kpis">
              {[
                ['86.6%', '平均准时率'],
                ['6条', '低于 90%'],
                ['10条', '监控线路'],
              ].map(([value, label]) => (
                <span key={label}>
                  <strong>{value}</strong>
                  <em>{label}</em>
                </span>
              ))}
            </div>
            {[
              ['沪京线', 98, '1,280单'],
              ['广深线', 96, '1,040单'],
              ['京津线', 94, '860单'],
              ['成渝线', 91, '720单'],
              ['粤蓉线', 88, '920单'],
              ['武西线', 82, '780单'],
              ['苏杭线', 79, '590单'],
              ['渝昆线', 76, '540单'],
              ['郑济线', 73, '486单'],
              ['成贵线', 69, '438单'],
            ].map(([route, rate, volume], index) => (
              <div
                className="warehouse-rate-bar-row"
                key={route}
                style={{ '--rate': `${rate}%` } as React.CSSProperties}
              >
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>{route}</span>
                <i>
                  <em />
                </i>
                <strong>{rate}%</strong>
                <small>{volume}</small>
              </div>
            ))}
            <div className="warehouse-rate-axis" aria-hidden="true">
              <span>60%</span>
              <span>70%</span>
              <span>80%</span>
              <span>90%</span>
              <span>100%</span>
            </div>
          </div>
        </OverviewPanel>

        <OverviewPanel title="线路平均运输时长" sub="AVERAGE ROUTE DURATION">
          <div className="warehouse-duration-timeline">
            <div className="warehouse-duration-summary">
              <span>
                <strong>15.5h</strong>
                <em>平均</em>
              </span>
              <span>
                <strong>粤蓉线</strong>
                <em>最长 22.6h</em>
              </span>
              <span>
                <strong>津青线</strong>
                <em>最短 7.6h</em>
              </span>
            </div>
            {[
              ['沪京线', '18.4h', 74],
              ['粤蓉线', '22.6h', 88],
              ['武西线', '15.8h', 62],
              ['津青线', '7.6h', 38],
              ['渝昆线', '13.2h', 54],
            ].map(([route, duration, left]) => (
              <div className="warehouse-duration-point" key={route}>
                <span>{route}</span>
                <i>
                  <em style={{ left: `${left}%` }} />
                </i>
                <strong>{duration}</strong>
              </div>
            ))}
          </div>
        </OverviewPanel>

        <OverviewPanel title="延误原因分布" sub="DELAY REASON DISTRIBUTION">
          <div className="warehouse-delay-chart">
            <div className="warehouse-delay-summary">
              <strong>12条</strong>
              <span>延误线路</span>
              <em>拥堵与装卸占比 64%</em>
            </div>
            <div className="warehouse-delay-columns">
              {[
                ['拥堵', 36, 'hot'],
                ['装卸', 28, 'warn'],
                ['天气', 18, 'cold'],
                ['查验', 12, 'normal'],
                ['绕行', 6, 'normal'],
              ].map(([reason, value, tone]) => (
                <div
                  className={`warehouse-delay-column warehouse-delay-column-${tone}`}
                  key={reason}
                >
                  <strong>{value}%</strong>
                  <i style={{ height: `${value}%` }} />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>
        </OverviewPanel>
      </aside>
      </section>
      {selectedWarehouseDetail ? (
        <button
          aria-label="关闭仓网详情"
          className="timeout-modal-backdrop"
          type="button"
          onClick={() => setSelectedWarehouseDetail(null)}
        >
          <section
            aria-label={selectedWarehouseDetail.title}
            className="timeout-modal warehouse-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="timeout-modal-head">
              <div>
                <span>仓网指标详情</span>
                <h3>{selectedWarehouseDetail.title}</h3>
              </div>
              <strong>
                {selectedWarehouseDetail.total}
                {selectedWarehouseDetail.unit}
              </strong>
            </div>
            <div className="timeout-modal-section">
              <span>指标说明</span>
              <p>{selectedWarehouseDetail.summary}</p>
            </div>
            <div className="timeout-modal-grid overview-detail-grid">
              {selectedWarehouseDetail.items.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="warehouse-record-list">
              {selectedWarehouseDetail.records.map((record, index) => (
                <div className="warehouse-record-row" key={`${record[0]}-${index}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{record[0]}</strong>
                  <em>{record[1]}</em>
                  <b>{record[2]}</b>
                  <i>{record[3]}</i>
                </div>
              ))}
            </div>
          </section>
        </button>
      ) : null}
    </>
  );
}

function WarehouseMapBackdrop() {
  const [shapes, setShapes] = useState<WarehouseMapShape[]>([]);
  const visibleShapes = shapes.length > 0 ? shapes : fallbackChinaMapShapes;

  useEffect(() => {
    let cancelled = false;

    async function loadMapModel() {
      try {
        const response = await fetch(WAREHOUSE_MAP_MODEL_SRC);
        const model = await response.json();
        const parsedShapes = parseWarehouseMapGltf(model);

        if (!cancelled) {
          setShapes(parsedShapes);
        }
      } catch {
        if (!cancelled) {
          setShapes([]);
        }
      }
    }

    void loadMapModel();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="warehouse-map-model-bg" aria-hidden="true">
      <svg
        className="warehouse-map-model"
        viewBox="0 0 1000 620"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="warehouseMapFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1cf28f" stopOpacity="0.2" />
            <stop offset="0.54" stopColor="#169a64" stopOpacity="0.54" />
            <stop offset="1" stopColor="#082d28" stopOpacity="0.78" />
          </linearGradient>
          <filter id="warehouseMapGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="1000" height="620" fill="rgba(2,8,16,0.2)" />
        {visibleShapes.map((shape, index) => (
          <path className={shape.className} d={shape.d} key={index} />
        ))}
        <g className="transport-china-map-lines">
          <path d="M220 218L314 500" />
          <path d="M304 196L436 492" />
          <path d="M386 150L512 448" />
          <path d="M536 138L604 468" />
          <path d="M692 214L640 414" />
          <path d="M168 268L844 286" />
          <path d="M198 382L742 348" />
        </g>
        <g className="transport-china-map-nodes">
          <circle cx="536" cy="300" r="8" />
          <circle cx="690" cy="292" r="6" />
          <circle cx="386" cy="374" r="6" />
          <circle cx="604" cy="402" r="5" />
        </g>
      </svg>
    </div>
  );
}

function ChinaMapWidgetBackdrop({ id }: { id: string }) {
  return (
    <div className="china-map-widget-backdrop" aria-hidden="true">
      <WidgetHost id={id} className="china-map-widget-host" />
    </div>
  );
}

function PersistentChinaMapStage({
  activeKey,
}: {
  activeKey: (typeof pages)[number]['key'];
}) {
  const mapWidgets: Array<{
    key: (typeof pages)[number]['key'];
    id: string;
  }> = [
    { key: 'overview', id: TRANSPORT_CHINA_MAP_WIDGET_ID },
    { key: 'warehouse', id: WAREHOUSE_CHINA_MAP_WIDGET_ID },
    { key: 'vehicle', id: VEHICLE_CHINA_MAP_WIDGET_ID },
  ];

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const resize = () => window.dispatchEvent(new Event('resize'));
    const frameId = window.requestAnimationFrame(resize);
    const timeoutIds = [120, 360, 800].map((delay) =>
      window.setTimeout(resize, delay)
    );

    return () => {
      window.cancelAnimationFrame(frameId);
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [activeKey]);

  return (
    <div className="persistent-china-map-stage" aria-hidden="true">
      {mapWidgets.map((item) => (
        <div
          className={
            item.key === activeKey
              ? 'persistent-china-map-layer persistent-china-map-layer-active'
              : 'persistent-china-map-layer'
          }
          key={item.id}
        >
          <ChinaMapWidgetBackdrop id={item.id} />
        </div>
      ))}
    </div>
  );
}

function parseWarehouseMapGltf(model: any): WarehouseMapShape[] {
  const bufferUri = model?.buffers?.[0]?.uri;

  if (typeof bufferUri !== 'string' || !bufferUri.includes(',')) {
    return [];
  }

  const binary = window.atob(bufferUri.split(',')[1]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const positionAccessor = model.accessors?.[0];
  const positionView = model.bufferViews?.[positionAccessor?.bufferView];
  const positions = new Float32Array(
    bytes.buffer,
    positionView.byteOffset ?? 0,
    (positionView.byteLength ?? 0) / 4
  );
  const minX = positionAccessor.min?.[0] ?? -3100;
  const maxX = positionAccessor.max?.[0] ?? 3100;
  const minZ = positionAccessor.min?.[2] ?? -1900;
  const maxZ = positionAccessor.max?.[2] ?? 1900;

  const toPoint = (pointIndex: number) => {
    const x = positions[pointIndex * 3];
    const z = positions[pointIndex * 3 + 2];
    return [
      ((x - minX) / (maxX - minX)) * 860 + 70,
      ((z - minZ) / (maxZ - minZ)) * 460 + 80,
    ];
  };

  return [2, 3, 4, 5, 6].flatMap((accessorIndex) => {
    const accessor = model.accessors?.[accessorIndex];
    const view = model.bufferViews?.[accessor?.bufferView];

    if (!accessor || !view) {
      return [];
    }

    const indices = new Uint32Array(
      bytes.buffer,
      view.byteOffset ?? 0,
      accessor.count ?? 0
    );
    const className =
      accessorIndex === 5
        ? 'warehouse-map-route'
        : accessorIndex === 6
          ? 'warehouse-map-risk-route'
          : accessorIndex === 4
            ? 'warehouse-map-ground'
            : 'warehouse-map-region';
    const paths: WarehouseMapShape[] = [];

    for (let index = 0; index < indices.length; index += 3) {
      const [ax, ay] = toPoint(indices[index]);
      const [bx, by] = toPoint(indices[index + 1]);
      const [cx, cy] = toPoint(indices[index + 2]);
      paths.push({
        className,
        d: `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(
          1
        )}L${cx.toFixed(1)} ${cy.toFixed(1)}Z`,
      });
    }

    return paths;
  });
}

function OverviewPanel({
  children,
  sub,
  title,
}: {
  children: ReactNode;
  sub: string;
  title: string;
}) {
  return (
    <section className="overview-panel">
      <div className="overview-panel-title">
        <h3>{title}</h3>
        <span>/</span>
        <em>{sub}</em>
      </div>
      {children}
    </section>
  );
}

function VehicleOrderView() {
  const [timeoutOrders, setTimeoutOrders] =
    useState<TimeoutOrder[]>(timeoutOrderFallback);
  const [selectedTimeoutOrder, setSelectedTimeoutOrder] =
    useState<TimeoutOrder | null>(null);
  const [selectedVehicleMetric, setSelectedVehicleMetric] = useState<
    [string, string, string, string] | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTimeoutOrders() {
      try {
        const rows = await loadFileDatasetRows(
          VISDOC_ID,
          TIMEOUT_ORDERS_DATASET_ID
        );
        const mapped = rows
          .map((row) => mapTimeoutOrder(row))
          .filter((row): row is TimeoutOrder => row !== null)
          .sort(
            (left, right) => left.remainingMinutes - right.remainingMinutes
          );

        if (!cancelled && mapped.length > 0) {
          setTimeoutOrders(mapped);
        }
      } catch {
        if (!cancelled) {
          setTimeoutOrders(timeoutOrderFallback);
        }
      }
    }

    void loadTimeoutOrders();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section
        className="overview-monitor vehicle-overview-monitor vehicle-data-only"
        aria-label="车辆订单监测平台"
      >
        <aside className="overview-left vehicle-side-metrics" aria-label="车辆在途状态">
          {[
            ['在途车辆数', '3,482', 'ACTIVE VEHICLES', '当前在线运输车辆，点击查看车辆分布、司机与订单承载情况。'],
            ['车辆实时点位', '2,916', 'LIVE POSITION', '正在回传定位的车辆点位，点击查看最近更新时间与定位异常。'],
            ['即将超时订单', '214', 'TIMEOUT SOON', '剩余时限低于预警阈值的订单，点击查看优先处置批次。'],
            ['偏离路线车辆', '37', 'ROUTE DEVIATION', '偏离规划路线或停留异常车辆，点击查看车牌与风险原因。'],
          ].map((metric) => {
            const [label, value, sub] = metric;
            return (
            <button
              className="vehicle-side-card"
              key={label}
              type="button"
              onClick={() => setSelectedVehicleMetric(metric)}
            >
              <span>{label}</span>
              <strong>{value}</strong>
              <em>{sub}</em>
            </button>
            );
          })}
        </aside>
        <aside className="overview-right">
          <OverviewPanel title="车辆核心指标" sub="FLEET CORE METRICS">
            <div className="vehicle-core-summary">
              {[
                ['在途车辆数', '3,482', '辆'],
                ['可调度车辆数', '1,126', '辆'],
                ['异常车辆数', '58', '辆'],
              ].map(([label, value, unit]) => (
                <div key={label}>
                  <strong>
                    {value}
                    <em>{unit}</em>
                  </strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="vehicle-mode-grid">
              {[
                ['干线运输', '3,482 在途车辆', '1,904', '干线车', '82.4%', '平均装载率', 'TR'],
                ['城配车辆', '12,486 同城订单', '1,126', '城配车', '214单', '即将超时订单', 'UR'],
                ['冷链车辆', '2-8°C 温控保障', '214', '冷链车', '12车', '低温告警', 'CC'],
                ['大件车辆', '工业设备专线', '58', '大件车', '69单', '已超时订单', 'XL'],
              ].map(([title, subtitle, value, unit, metric, label, icon]) => (
                <div className="vehicle-mode-card" key={title}>
                  <div className="vehicle-mode-card-head">
                    <span>
                      <b>{title}</b>
                      <em>{subtitle}</em>
                    </span>
                    <i>{icon}</i>
                  </div>
                  <div className="vehicle-mode-card-body">
                    <strong>{value}</strong>
                    <span>{unit}</span>
                  </div>
                  <div className="vehicle-mode-card-foot">
                    <b>{metric}</b>
                    <span>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </OverviewPanel>

          <OverviewPanel title="重点订单与异常车辆" sub="ORDER AND FLEET ALERT">
            <div className="vehicle-alert-columns">
              <div>
                <b>重点订单列表</b>
                {timeoutOrders.slice(0, 12).map((order, index) => (
                  <button
                    className="vehicle-alert-row"
                    key={`${order.orderId}-focus`}
                    type="button"
                    onClick={() => setSelectedTimeoutOrder(order)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{order.orderId}</strong>
                    <em>{order.remainingMinutes}min</em>
                  </button>
                ))}
              </div>
              <div>
                <b>异常车辆列表</b>
                {[
                  ['粤B·0619', '偏离路线'],
                  ['川A·7285', '即将超时'],
                  ['鄂A·4392', '停留过久'],
                  ['陕A·7115', '装车延迟'],
                  ['沪A·9237', '拥堵低速'],
                  ['苏E·2048', '绕行中'],
                  ['冀B·8062', '空驶偏高'],
                  ['鲁A·6621', '等待装卸'],
                  ['津C·3908', '温控波动'],
                  ['渝D·5186', '油耗异常'],
                  ['皖A·2730', '晚点预警'],
                  ['闽D·7492', '信号离线'],
                ].map(([vehicle, state], index) => (
                  <div className="vehicle-alert-row" key={vehicle}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{vehicle}</strong>
                    <em>{state}</em>
                  </div>
                ))}
              </div>
            </div>
          </OverviewPanel>

          <OverviewPanel title="区域车辆供需对比" sub="FLEET SUPPLY DEMAND">
            <div className="vehicle-overview-demand">
              {[
                ['华东', '920', '980'],
                ['华南', '760', '840'],
                ['华北', '610', '650'],
                ['西南', '480', '560'],
                ['华中', '540', '590'],
                ['西北', '320', '390'],
              ].map(([region, supply, demand]) => (
                <VehicleDemandRow
                  key={region}
                  demand={Number(demand)}
                  region={region}
                  supply={Number(supply)}
                />
              ))}
            </div>
          </OverviewPanel>
        </aside>
      </section>

      {selectedTimeoutOrder ? (
        <button
          aria-label="关闭订单详情"
          className="timeout-modal-backdrop"
          type="button"
          onClick={() => setSelectedTimeoutOrder(null)}
        >
          <section
            aria-label={`${selectedTimeoutOrder.orderId} 订单详情`}
            className="timeout-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="timeout-modal-head">
              <div>
                <span>订单详情</span>
                <h3>{selectedTimeoutOrder.orderId}</h3>
              </div>
              <strong>{selectedTimeoutOrder.remainingMinutes}min</strong>
            </div>
            <div className="timeout-modal-grid">
              <div>
                <span>业务类型</span>
                <strong>{selectedTimeoutOrder.businessType}</strong>
              </div>
              <div>
                <span>货物类型</span>
                <strong>{selectedTimeoutOrder.cargoType}</strong>
              </div>
              <div>
                <span>运输线路</span>
                <strong>{selectedTimeoutOrder.route}</strong>
              </div>
              <div>
                <span>预计到达</span>
                <strong>{selectedTimeoutOrder.eta}</strong>
              </div>
              <div>
                <span>车辆</span>
                <strong>{selectedTimeoutOrder.vehicleNo}</strong>
              </div>
              <div>
                <span>司机</span>
                <strong>{selectedTimeoutOrder.driver}</strong>
              </div>
            </div>
            <div className="timeout-modal-section">
              <span>风险原因</span>
              <p>{selectedTimeoutOrder.riskReason}</p>
            </div>
            <div className="timeout-modal-section">
              <span>处置建议</span>
              <p>{selectedTimeoutOrder.suggestion}</p>
            </div>
          </section>
        </button>
      ) : null}
      {selectedVehicleMetric ? (
        <button
          aria-label="关闭车辆指标详情"
          className="timeout-modal-backdrop"
          type="button"
          onClick={() => setSelectedVehicleMetric(null)}
        >
          <section
            aria-label={`${selectedVehicleMetric[0]} 指标详情`}
            className="timeout-modal vehicle-metric-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="timeout-modal-head">
              <div>
                <span>车辆指标详情</span>
                <h3>{selectedVehicleMetric[0]}</h3>
              </div>
              <strong>{selectedVehicleMetric[1]}</strong>
            </div>
            <div className="timeout-modal-section">
              <span>{selectedVehicleMetric[2]}</span>
              <p>{selectedVehicleMetric[3]}</p>
            </div>
          </section>
        </button>
      ) : null}
    </>
  );
}

function VehicleDemandRow({
  demand,
  region,
  supply,
}: {
  demand: number;
  region: string;
  supply: number;
}) {
  const ratio = Math.max(0, Math.min(100, Math.round((supply / demand) * 100)));
  const gap = Math.max(0, demand - supply);
  const gapRatio =
    demand > 0 ? Math.min(22, Math.round((gap / demand) * 100)) : 0;

  return (
    <div className="vehicle-demand-row">
      <span>{region}</span>
      <div className="vehicle-demand-track">
        <div className="vehicle-demand-fill" style={{ width: `${ratio}%` }} />
        {gap > 0 ? (
          <div
            className="vehicle-demand-gap"
            style={{
              left: `calc(${Math.max(0, ratio - gapRatio)}% + 2px)`,
              width: `${gapRatio}%`,
            }}
          />
        ) : null}
      </div>
      <strong>{supply}</strong>
      <em>{demand}</em>
    </div>
  );
}

function buildScrollableTimeoutOrders(orders: TimeoutOrder[]) {
  if (orders.length <= 3) {
    return orders;
  }
  return [...orders, ...orders];
}

function mapTimeoutOrder(row: Record<string, unknown>): TimeoutOrder | null {
  const orderId = normalizeText(row['订单号']);
  if (!orderId) {
    return null;
  }

  return {
    orderId,
    businessType: normalizeText(row['业务类型']),
    route: normalizeText(row['运输线路']),
    vehicleNo: normalizeText(row['车牌号']),
    driver: normalizeText(row['司机']),
    eta: normalizeText(row['预计到达']),
    remainingMinutes: normalizeNumber(row['剩余时限'], 0),
    riskReason: normalizeText(row['风险原因']),
    cargoType: normalizeText(row['货物类型']),
    suggestion: normalizeText(row['处置建议']),
  };
}

async function loadFileDatasetRows(visdocId: string, datasetId: string) {
  const configResponse = await fetch(`/api/visdocs/${visdocId}/data-config`, {
    credentials: 'include',
  });
  if (!configResponse.ok) {
    throw new Error(`Failed to load data-config for ${visdocId}`);
  }

  const configJson = (await configResponse.json()) as {
    datasets?: Array<{ id: string; datasourceId?: string }>;
    datasources?: Array<{ id: string; config?: { dataId?: string } }>;
  };

  const dataset = configJson.datasets?.find((item) => item.id === datasetId);
  const datasource = configJson.datasources?.find(
    (item) => item.id === dataset?.datasourceId
  );
  const dataId = datasource?.config?.dataId;

  if (!dataId) {
    throw new Error(`Dataset ${datasetId} is not backed by file-data`);
  }

  const fileResponse = await fetch(
    `/api/visdocs/${visdocId}/file-data/${dataId}`,
    {
      credentials: 'include',
    }
  );
  if (!fileResponse.ok) {
    throw new Error(`Failed to load file-data ${dataId}`);
  }

  const fileJson = (await fileResponse.json()) as FileDatasetResponse;
  return fileJson.values.map((row) =>
    Object.fromEntries(
      fileJson.fields.map((field, index) => [field, row[index]])
    )
  );
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function ResourceCard({
  note,
  stats,
  subtitle,
  title,
  tone,
}: {
  note: string;
  stats: [string, string][];
  subtitle: string;
  title: string;
  tone: 'blue' | 'green' | 'red' | 'yellow';
}) {
  return (
    <article className={`resource-card resource-card-${tone}`}>
      <div className="resource-card-head">
        <div>
          <h4>{title}</h4>
          <span>{subtitle}</span>
        </div>
        <i />
      </div>
      <div className="resource-card-stats">
        {stats.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p>{note}</p>
    </article>
  );
}

function ResourceConsolePanel({
  embedded = false,
  panel,
}: {
  embedded?: boolean;
  panel: (typeof resourcePanels)[keyof typeof resourcePanels];
}) {
  return (
    <section
      className={
        embedded
          ? 'resource-console resource-console-embedded'
          : 'resource-console'
      }
    >
      <VehicleSectionHeader title={panel.title} />
      <div className="resource-summary">
        {panel.summary.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="resource-card-grid">
        {panel.cards.map((card) => (
          <ResourceCard
            key={card.title}
            title={card.title}
            subtitle={card.subtitle}
            stats={card.stats}
            note={card.note}
            tone={card.tone}
          />
        ))}
      </div>
    </section>
  );
}

function VehicleSectionHeader({ title }: { title: string }) {
  return (
    <div className="vehicle-console-title">
      <div className="section-heading">
        <span className="heading-dots" />
        <h3>{title}</h3>
      </div>
      <div className="console-arrows" />
    </div>
  );
}

function VehicleMetricTile({
  icon,
  label,
  tone = 'blue',
  unit,
  value,
}: {
  icon: string;
  label: string;
  tone?: 'blue' | 'green' | 'red' | 'yellow';
  unit: string;
  value: string;
}) {
  return (
    <div className={`vehicle-metric-tile vehicle-tone-${tone}`}>
      <div className="vehicle-tile-main">
        <div>
          <span>{label}</span>
          <strong>
            {value}
            <em>{unit}</em>
          </strong>
        </div>
        <i>{icon}</i>
      </div>
      <div className="vehicle-spark">
        {[22, 28, 25, 36, 31, 43, 27, 49, 58].map((height, index) => (
          <b key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function VehicleStrip({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'blue' | 'green' | 'red';
  value: string;
}) {
  return (
    <div className={`vehicle-strip vehicle-strip-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Panel({
  children,
  marker,
  title,
}: {
  children: ReactNode;
  marker: string;
  title: string;
}) {
  return (
    <article className="data-panel">
      <div className="panel-title">
        <div className="section-heading">
          <span className="heading-dots" />
          <h3>{title}</h3>
        </div>
        <div className="heading-tail">
          <span>{marker}</span>
          <i />
        </div>
      </div>
      <div className="panel-content">{children}</div>
    </article>
  );
}
