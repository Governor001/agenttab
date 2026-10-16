import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Briefcase, BarChart2, Bot } from 'lucide-react'
import { BusinessTab } from './components/BusinessTab'
import { ProviderTab } from './components/ProviderTab'
import { AgentDemoTab } from './components/AgentDemo'
import { AGENT_TAB_ADDRESS, AGENT_TAB_CHAIN, EXPLORER_BASE } from './contracts/agentTab'
import { shortAddr } from './lib/format'

type Tab = 'business' | 'provider' | 'agent'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'business', label: 'Business', icon: <Briefcase size={15} /> },
  { id: 'provider', label: 'Provider', icon: <BarChart2 size={15} /> },
  { id: 'agent', label: 'Agent demo', icon: <Bot size={15} /> },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('business')

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Top nav */}
      <header className="sticky top-0 z-10 backdrop-blur-md"
        style={{ background: 'rgba(8,15,24,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent)', boxShadow: '0 0 12px rgba(74,222,128,0.3)' }}>
              <Bot size={14} style={{ color: '#080f18' }} />
            </div>
            <span className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>AgentTab</span>
            <span className="text-xs px-2 py-0.5 rounded-full hidden sm:inline"
              style={{ background: 'var(--surface)', color: 'var(--subtle)', border: '1px solid var(--border)' }}>
              {AGENT_TAB_CHAIN.name}
            </span>
          </div>
          <ConnectKitButton.Custom>
            {({ isConnected, show, address: addr, ensName }) => (
              <button onClick={show}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                style={{
                  background: isConnected ? 'var(--surface-strong)' : 'var(--accent)',
                  color: isConnected ? 'var(--ink-2)' : '#080f18',
                  border: '1px solid var(--border)',
                }}>
                {isConnected
                  ? <><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--success)' }} />{ensName ?? shortAddr(addr ?? '')}</>
                  : 'Connect wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        {/* Contract info strip */}
        <div className="mb-5 flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
          <span>Contract:</span>
          <a href={`${EXPLORER_BASE}/address/${AGENT_TAB_ADDRESS}`} target="_blank" rel="noopener"
            className="mono hover:underline flex items-center gap-0.5" style={{ color: 'var(--accent-dim)' }}>
            {AGENT_TAB_ADDRESS}
          </a>
        </div>

        {/* Tab bar */}
        <nav className="flex gap-1 mb-6 rounded-xl p-1" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: activeTab === t.id ? 'var(--surface-strong)' : 'transparent',
                color: activeTab === t.id ? 'var(--accent)' : 'var(--subtle)',
                border: activeTab === t.id ? '1px solid var(--border-strong)' : '1px solid transparent',
              }}>
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Tab content */}
        {activeTab === 'business' && <BusinessTab />}
        {activeTab === 'provider' && <ProviderTab />}
        {activeTab === 'agent' && <AgentDemoTab />}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 py-2 text-center text-xs"
        style={{ color: 'var(--subtle)', background: 'rgba(8,15,24,0.7)', backdropFilter: 'blur(8px)' }}>
        AgentTab — prepaid USDC billing for AI agents — Arc Testnet
      </footer>
    </div>
  )
}
