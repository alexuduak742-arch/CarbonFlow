import { useState, useEffect } from 'react';
import { 
  Leaf, TrendingUp, Shield, AlertCircle, Settings, 
  MapPin, BarChart3, Coins, Lock, Unlock 
} from 'lucide-react';

interface Project {
  id: number;
  owner: string;
  area: number;
  projectType: string;
  status: string;
  creditsMinted: number;
  insuranceCovered: number;
}

interface Stats {
  totalProjects: number;
  totalCreditsMinted: number;
  totalInsurancePool: number;
}

function App() {
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'projects' | 'credits' | 'insurance' | 'security'>('dashboard');
  const [stats, setStats] = useState<Stats>({
    totalProjects: 0,
    totalCreditsMinted: 0,
    totalInsurancePool: 0
  });

  const connectWallet = async () => {
    // Placeholder for Stacks Connect integration
    setConnected(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-green-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-2 rounded-lg">
                <Leaf className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">CarbonFlow</h1>
                <p className="text-sm text-gray-500">Carbon Credit Tokenization Platform</p>
              </div>
            </div>
            <button
              onClick={connectWallet}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                connected
                  ? 'bg-green-100 text-green-700 border-2 border-green-300'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 shadow-lg'
              }`}
            >
              {connected ? '🟢 Connected' : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'projects', label: 'Projects', icon: MapPin },
              { id: 'credits', label: 'Credits', icon: Coins },
              { id: 'insurance', label: 'Insurance', icon: Shield },
              { id: 'security', label: 'Security', icon: Lock }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <DashboardView stats={stats} />}
        {activeTab === 'projects' && <ProjectsView />}
        {activeTab === 'credits' && <CreditsView />}
        {activeTab === 'insurance' && <InsuranceView />}
        {activeTab === 'security' && <SecurityView />}
      </main>
    </div>
  );
}

function DashboardView({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total Projects"
          value={stats.totalProjects.toString()}
          icon={MapPin}
          color="blue"
          trend="+12%"
        />
        <StatCard
          title="Credits Minted"
          value={(stats.totalCreditsMinted / 1000000).toFixed(2) + 'M'}
          icon={Coins}
          color="green"
          trend="+8%"
        />
        <StatCard
          title="Insurance Pool"
          value={(stats.totalInsurancePool / 1000000).toFixed(2) + ' STX'}
          icon={Shield}
          color="purple"
          trend="+15%"
        />
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <TrendingUp className="w-6 h-6 mr-2 text-green-600" />
          Recent Activity
        </h2>
        <div className="space-y-3">
          {[
            { action: 'Project Registered', project: 'Forest #42', time: '2 hours ago', type: 'success' },
            { action: 'Credits Minted', amount: '1,000 tons', time: '5 hours ago', type: 'info' },
            { action: 'Insurance Contribution', amount: '500 STX', time: '1 day ago', type: 'warning' }
          ].map((activity, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${
                  activity.type === 'success' ? 'bg-green-500' :
                  activity.type === 'info' ? 'bg-blue-500' : 'bg-yellow-500'
                }`} />
                <div>
                  <p className="font-medium text-gray-900">{activity.action}</p>
                  <p className="text-sm text-gray-500">{activity.project || activity.amount}</p>
                </div>
              </div>
              <span className="text-sm text-gray-400">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectsView() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">My Projects</h2>
        <button className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 shadow-lg transition-all">
          + Register New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((id) => (
          <div key={id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <Leaf className="w-6 h-6 text-green-600" />
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                Active
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Forest Project #{id}</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p>📍 Area: 5,000 m²</p>
              <p>🌳 Type: Reforestation</p>
              <p>💰 Credits: 100,000</p>
              <p>🛡️ Insurance: 50 STX</p>
            </div>
            <button className="mt-4 w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700 transition-colors">
              View Details
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreditsView() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Carbon Credits</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
            <p className="text-sm text-gray-600 mb-1">Your Balance</p>
            <p className="text-3xl font-bold text-green-600">1,250,000</p>
            <p className="text-sm text-gray-500 mt-1">Carbon Credits</p>
          </div>
          <div className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600 mb-1">Market Value</p>
            <p className="text-3xl font-bold text-blue-600">$12,500</p>
            <p className="text-sm text-gray-500 mt-1">@ $0.01 per credit</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-gray-900">Transfer Credits</h3>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Recipient Address"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <input
              type="number"
              placeholder="Amount"
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              Transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InsuranceView() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <Shield className="w-7 h-7 mr-2 text-purple-600" />
          Insurance Pool
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="p-6 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-gray-600 mb-1">Total Pool</p>
            <p className="text-2xl font-bold text-purple-600">5,000 STX</p>
          </div>
          <div className="p-6 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600 mb-1">Coverage Amount</p>
            <p className="text-2xl font-bold text-blue-600">50,000 STX</p>
          </div>
          <div className="p-6 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-gray-600 mb-1">Contributors</p>
            <p className="text-2xl font-bold text-green-600">42</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-gray-900">Contribute to Insurance</h3>
          <div className="flex gap-4">
            <input
              type="number"
              placeholder="Project ID"
              className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <input
              type="number"
              placeholder="STX Amount"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              Contribute
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecurityView() {
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [circuitBreaker, setCircuitBreaker] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <Lock className="w-7 h-7 mr-2 text-red-600" />
          Security Controls
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Emergency Mode */}
          <div className="p-6 border-2 border-red-200 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-red-600" />
                Emergency Mode
              </h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                emergencyMode ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {emergencyMode ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Pauses all contract operations for emergency situations
            </p>
            <button className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              {emergencyMode ? 'Deactivate' : 'Activate'} Emergency Mode
            </button>
          </div>

          {/* Circuit Breaker */}
          <div className="p-6 border-2 border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-yellow-600" />
                Circuit Breaker
              </h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                circuitBreaker ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
              }`}>
                {circuitBreaker ? 'Triggered' : 'Normal'}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Automatic protection when pool exceeds threshold
            </p>
            <button className="w-full py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
              Check Circuit Breaker
            </button>
          </div>

          {/* Admin Transfer */}
          <div className="p-6 border-2 border-blue-200 rounded-lg">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2 text-blue-600" />
              Admin Transfer
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Two-step process with 144-block timelock
            </p>
            <input
              type="text"
              placeholder="New Admin Address"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Initiate Transfer
            </button>
          </div>

          {/* Blacklist */}
          <div className="p-6 border-2 border-gray-200 rounded-lg">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center">
              <Lock className="w-5 h-5 mr-2 text-gray-600" />
              User Blacklist
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Prevent malicious users from interacting
            </p>
            <input
              type="text"
              placeholder="User Address"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            />
            <button className="w-full py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
              Blacklist User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend }: any) {
  const colorClasses = {
    blue: 'from-blue-500 to-cyan-500',
    green: 'from-green-500 to-emerald-500',
    purple: 'from-purple-500 to-pink-500'
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`bg-gradient-to-br ${colorClasses[color]} p-3 rounded-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <span className="text-sm font-medium text-green-600">{trend}</span>
      </div>
      <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

export default App;
