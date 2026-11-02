import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from 'react'
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2,
  ChevronRight, CircleAlert, Clock3, CloudUpload, Copy, Download,
  Eye, EyeOff, FileArchive, Files, KeyRound,
  LoaderCircle, LockKeyhole, RefreshCcw, Shield, ShieldCheck,
  Timer, UploadCloud,
} from 'lucide-react'

type ShareInfo = {
  token: string
  name: string
  size: number
  created_at: string
  expires_at: string
  password_required: boolean
  max_downloads: number | null
  remaining_downloads: number | null
  active: boolean
  inactive_reason: string | null
}
type UploadResponse = ShareInfo & { share_path: string; manage_key: string; download_count: number }
type Stats = ShareInfo & { download_count: number; file_deleted: boolean }
type SavedUpload = { token: string; manageKey: string; name: string; createdAt: string }
const STORAGE_KEY = 'dropvault-managed-v1'
const MAX_SIZE = 20 * 1024 * 1024

function loadUploads(): SavedUpload[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((r) => typeof r?.token === 'string' && typeof r?.manageKey === 'string').slice(0, 40) : []
  } catch { return [] }
}
function saveUploads(value: SavedUpload[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* private browsing */ }
}
function formatSize(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`
}
function formatDate(s: string) {
  return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
async function errorMessage(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json()
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>
      if (typeof obj.detail === 'string') return obj.detail
      const first = Object.values(obj)[0]
      if (Array.isArray(first)) return first.map(String).join(', ')
      if (typeof first === 'string') return first
    }
  } catch { /* non-JSON HTTP error */ }
  return `Request failed (${res.status})`
}
function FileGlyph({ size = 20 }: { size?: number }) { return <FileArchive size={size} strokeWidth={1.8} /> }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' }) {
  return <span className={`pill ${tone}`}>{children}</span>
}
function Header({ active, onNav }: { active: 'upload' | 'history'; onNav: (v: 'upload' | 'history') => void }) {
  return <header className="topbar"><div className="shell topbar-inner">
    <button className="brand" onClick={() => { window.history.pushState({}, '', '/'); onNav('upload') }} aria-label="DropVault home">
      <span className="brand-mark"><ShieldCheck size={23} strokeWidth={2.3} /></span><span>drop<span className="brand-accent">vault</span><span className="brand-dot">.</span></span>
    </button>
    <div className="top-actions">
      <span className="top-caption"><span className="status-dot" /> Secure local file sharing</span>
      <button className={`nav-button ${active === 'upload' ? 'active' : ''}`} onClick={() => { window.history.pushState({}, '', '/'); onNav('upload') }}>Upload</button>
      <button className={`nav-button ${active === 'history' ? 'active' : ''}`} onClick={() => { window.history.pushState({}, '', '/'); onNav('history') }}><Files size={16}/> My uploads</button>
    </div>
  </div></header>
}
function UploadPage({ onUploaded }: { onUploaded: (r: UploadResponse) => void }) {
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [expires, setExpires] = useState('24')
  const [limit, setLimit] = useState('5')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<UploadResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const shareUrl = created ? `${window.location.origin}${created.share_path}` : ''
  function chooseFile(input: File | undefined) {
    if (!input) return
    setError('')
    if (input.size > MAX_SIZE) { setError('Files must be 20 MB or smaller.'); setFile(null); return }
    if (input.size === 0) { setError('Empty files cannot be shared.'); setFile(null); return }
    setFile(input)
  }
  function onDrop(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files[0]) }
  function onChange(e: ChangeEvent<HTMLInputElement>) { chooseFile(e.target.files?.[0]); e.target.value = '' }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file || busy) return
    setBusy(true); setError('')
    const body = new FormData()
    body.append('file', file)
    body.append('expires_in_hours', expires)
    if (limit !== 'unlimited') body.append('max_downloads', limit)
    if (password) body.append('password', password)
    try {
      const res = await fetch('/api/files/', { method: 'POST', body })
      if (!res.ok) throw new Error(await errorMessage(res))
      const response = (await res.json()) as UploadResponse
      setCreated(response)
      onUploaded(response)
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed. Please retry.') }
    finally { setBusy(false) }
  }
  function reset() { setCreated(null); setFile(null); setPassword(''); setCopied(false); setError('') }
  async function copy() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true) }
    catch { setError('Could not copy automatically. Please select the link and copy it.') }
  }
  return <>
    <section className="hero">
      <Pill tone="green"><span className="tiny-dot"/> PRIVATE BY DESIGN</Pill>
      <h1>Share it.<br/><span className="gradient-text">Then forget it.</span></h1>
      <p>Send files with confidence. Set an expiration, control downloads, and let your links disappear when they're done.</p>
    </section>
    {created ? <section className="card success-card animate-in">
      <div className="success-illustration"><CheckCircle2 size={34}/></div>
      <h2>Your file is ready to share</h2>
      <p className="muted centered">The share link has been created. Only people with the link can open the download page.</p>
      <div className="uploaded-file"><span className="file-icon"><FileGlyph/></span><div className="flex-1 ellipsis"><strong className="ellipsis">{created.name}</strong><small>{formatSize(created.size)}</small></div><Pill tone="green">Ready</Pill></div>
      <label className="field-label">SHAREABLE LINK</label>
      <div className="copy-wrap"><input readOnly value={shareUrl} aria-label="Shareable link"/><button className="button button-primary" onClick={copy}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy'}</button></div>
      <div className="inline-facts"><span><Clock3 size={15}/> Expires {formatDate(created.expires_at)}</span><span><Download size={15}/> {created.max_downloads ?? 'Unlimited'} downloads</span>{created.password_required && <span><LockKeyhole size={15}/> Password protected</span>}</div>
      <div className="notice small"><Shield size={17}/> Your statistics management key is saved in this browser only. Keep it private; clearing browser storage will remove access to those statistics.</div>
      <button className="button button-outline full-width" onClick={reset}><UploadCloud size={17}/> Upload another file</button>
    </section> : <form className="card upload-card" onSubmit={submit}>
      <div className="card-heading"><div><span className="eyebrow">NEW TRANSFER</span><h2>Upload your file</h2><p>Quick, private, and completely in your control.</p></div><span className="heading-symbol"><CloudUpload size={26}/></span></div>
      <input type="file" ref={fileInput} className="visually-hidden" onChange={onChange} aria-label="Choose file" />
      <div role="button" tabIndex={0} aria-label="Choose or drop file" className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={(e) => {e.preventDefault(); setDragging(true)}} onDragLeave={(e) => { e.preventDefault(); setDragging(false) }} onDrop={onDrop} onClick={() => fileInput.current?.click()} onKeyDown={(e)=>{ if(e.key === 'Enter' || e.key === ' ') {e.preventDefault(); fileInput.current?.click()} }}>
        {file ? <><span className="drop-icon"><FileGlyph size={30}/></span><strong className="chosen-name">{file.name}</strong><p>{formatSize(file.size)} · Click to replace</p></> : <><span className="drop-icon"><UploadCloud size={30} strokeWidth={1.7}/></span><strong>Drag & drop your file here</strong><p>or <span className="linkish">browse your device</span></p><small>Up to 20 MB · Any file type</small></>}
      </div>
      <div className="form-two">
        <div><label className="field-label" htmlFor="expiration"><Timer size={14}/> LINK EXPIRATION</label><div className="select-wrap"><select id="expiration" value={expires} onChange={e=>setExpires(e.target.value)}><option value="1">After 1 hour</option><option value="24">After 24 hours</option><option value="168">After 7 days</option></select></div></div>
        <div><label className="field-label" htmlFor="download-limit"><Download size={14}/> DOWNLOAD LIMIT</label><div className="select-wrap"><select id="download-limit" value={limit} onChange={e=>setLimit(e.target.value)}><option value="1">1 download</option><option value="5">5 downloads</option><option value="10">10 downloads</option><option value="unlimited">Unlimited</option></select></div></div>
      </div>
      <label className="field-label" htmlFor="password"><LockKeyhole size={14}/> PASSWORD PROTECTION <span className="optional">OPTIONAL</span></label>
      <div className="password-wrap"><input id="password" type={showPass ? 'text' : 'password'} minLength={4} maxLength={128} placeholder="Add a password for extra security" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><button type="button" onClick={()=>setShowPass(v=>!v)} aria-label={showPass ? 'Hide password' : 'Show password'}>{showPass ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
      {error && <div className="error-box" role="alert"><CircleAlert size={17}/> {error}</div>}
      <button className="button button-primary upload-submit full-width" disabled={!file || busy} type="submit">{busy ? <><LoaderCircle size={19} className="spin"/> Uploading...</> : <><ShieldCheck size={19}/> Create secure link <ArrowRight size={18}/></>}</button>
      <div className="secure-note"><ShieldCheck size={14}/> Files are stored privately and automatically removed after expiration or download limit.</div>
    </form>}
    <div className="benefits"><div><span className="benefit-icon"><Timer size={20}/></span><strong>Time-limited</strong><small>Links expire automatically</small></div><div><span className="benefit-icon"><LockKeyhole size={20}/></span><strong>Protected</strong><small>Optional password access</small></div><div><span className="benefit-icon"><BarChart3 size={20}/></span><strong>Trackable</strong><small>See how many times files are downloaded</small></div></div>
  </>
}
function HistoryPage({ entries }: { entries: SavedUpload[] }) {
  const [stats, setStats] = useState<Record<string, Stats>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  async function refresh() {
    setLoading(true)
    const result = await Promise.all(entries.map(async entry => {
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(entry.token)}/stats/`, { headers: { 'X-Manage-Key': entry.manageKey } })
        if (!res.ok) throw new Error(await errorMessage(res))
        return { token: entry.token, data: await res.json() as Stats, error: '' }
      } catch (e) { return { token: entry.token, data: undefined, error: e instanceof Error ? e.message : 'Network error' } }
    }))
    setStats(Object.fromEntries(result.filter(x=>x.data).map(x=>[x.token, x.data!])) )
    setErrors(Object.fromEntries(result.filter(x=>x.error).map(x=>[x.token, x.error])))
    setLoading(false)
  }
  useEffect(() => { void refresh() }, [entries]) // refresh stats when uploads change
  const total = Object.values(stats).reduce((sum, s) => sum + s.download_count, 0)
  return <section className="history-page animate-in"><div className="history-head"><div><Pill tone="green">YOUR WORKSPACE</Pill><h1>My uploads<span className="brand-dot">.</span></h1><p>View your files, link status, and download activity.</p></div><button className="button button-outline" onClick={refresh} disabled={loading}><RefreshCcw size={17} className={loading ? 'spin' : ''}/> Refresh</button></div>
    <div className="stat-grid"><div className="stat-card"><Files size={19}/><span>Total uploads</span><strong>{entries.length}</strong></div><div className="stat-card"><Download size={19}/><span>Total downloads</span><strong>{total}</strong></div><div className="stat-card"><ShieldCheck size={19}/><span>Active links</span><strong>{Object.values(stats).filter(s=>s.active).length}</strong></div></div>
    {entries.length === 0 ? <div className="card empty-state"><span className="drop-icon"><Files size={30}/></span><h2>Nothing here yet</h2><p>Files you upload from this browser will appear here, along with their private statistics.</p></div> : <div className="files-list">{entries.map(entry => { const s = stats[entry.token]; return <div key={entry.token} className="file-row card"><span className="file-icon"><FileGlyph/></span><div className="file-main"><strong title={entry.name}>{entry.name}</strong><small>{s ? `${formatSize(s.size)} · Uploaded ${formatDate(s.created_at)}` : `Uploaded ${formatDate(entry.createdAt)}`}</small>{errors[entry.token] && <small className="error-text">{errors[entry.token]}</small>}</div><div className="file-stats">{s && <><Pill tone={s.active ? 'green' : 'amber'}>{s.active ? 'Active' : 'Inactive'}</Pill><span>{s.download_count} download{s.download_count === 1 ? '' : 's'}</span></>}</div><button className="round-button" title="Open share page" aria-label={`Open ${entry.name}`} onClick={() => window.location.assign(`/s/${entry.token}`)}><ChevronRight size={20}/></button></div> })}</div>}
    <div className="notice"><KeyRound size={18}/> Statistics are only available in the browser that created the upload. Management keys are not included in share links.</div>
  </section>
}
function SharePage({ token }: { token: string }) {
  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [fetching, setFetching] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  async function refresh() {
    try {
      const res = await fetch(`/api/shares/${encodeURIComponent(token)}/`)
      if (!res.ok) { setNotFound(true); return }
      setInfo((await res.json()) as ShareInfo)
    } catch { setError('Could not load this link. Check your connection.') }
    finally { setFetching(false) }
  }
  useEffect(()=>{ void refresh() }, [token])
  async function download(e: FormEvent) {
    e.preventDefault()
    if (!info || !info.active || downloading) return
    setError(''); setDownloading(true)
    try {
      const response = await fetch(`/api/shares/${encodeURIComponent(token)}/download/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      if (!response.ok) throw new Error(await errorMessage(response))
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = info.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Download failed.'); await refresh() }
    finally { setDownloading(false) }
  }
  return <div className="share-layout"><div className="share-top"><a href="/" className="brand"><span className="brand-mark"><ShieldCheck size={23}/></span><span>drop<span className="brand-accent">vault</span><span className="brand-dot">.</span></span></a><Pill tone="green"><Shield size={13}/> SECURE TRANSFER</Pill></div>
    <section className="card share-card animate-in">
      {fetching ? <div className="center-loader"><LoaderCircle className="spin" size={32}/> Loading your link...</div> : notFound || !info ? <div className="share-body"><span className="large-icon"><CircleAlert size={30}/></span><h1>Link not found</h1><p>This file link doesn't exist or is unavailable.</p><a href="/" className="button button-outline"><ArrowLeft size={17}/> Back to DropVault</a></div> : <div className="share-body">
        <span className="large-icon"><FileGlyph size={34}/></span><Pill tone={info.active ? 'green' : 'amber'}>{info.active ? 'READY TO DOWNLOAD' : 'LINK UNAVAILABLE'}</Pill>
        <h1>{info.active ? 'A file is waiting for you.' : 'This link is no longer active.'}</h1><p>{info.active ? 'Your file is ready. Download it before the link expires.' : info.inactive_reason}</p>
        <div className="download-file"><span className="file-icon"><FileGlyph size={24}/></span><div className="flex-1 ellipsis"><strong className="ellipsis">{info.name}</strong><small>{formatSize(info.size)}</small></div></div>
        <div className="share-details"><div><Clock3 size={16}/><span>Expires</span><strong>{formatDate(info.expires_at)}</strong></div><div><Download size={16}/><span>Downloads left</span><strong>{info.remaining_downloads === null ? 'Unlimited' : info.remaining_downloads}</strong></div></div>
        {info.active && <form onSubmit={download} className="download-form">{info.password_required && <><label className="field-label" htmlFor="share-password"><LockKeyhole size={14}/> PASSWORD REQUIRED</label><div className="password-wrap"><input id="share-password" type={showPass ? 'text' : 'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter the file password" autoComplete="off"/><button type="button" onClick={()=>setShowPass(v=>!v)} aria-label="Toggle password visibility">{showPass ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></>}
          {error && <div role="alert" className="error-box"><CircleAlert size={17}/> {error}</div>}
          <button className="button button-primary full-width upload-submit" disabled={downloading || (info.password_required && !password)} type="submit">{downloading ? <><LoaderCircle className="spin" size={18}/> Preparing file...</> : <><ArrowDownToLine size={19}/> Download file <ArrowRight size={18}/></>}</button>
        </form>}
        {!info.active && <a href="/" className="button button-outline full-width"><ArrowLeft size={16}/> Share a new file</a>}
      </div>}
    </section><p className="share-foot"><ShieldCheck size={15}/> Secure file sharing, powered by DropVault.</p>
  </div>
}
export default function App() {
  const path = window.location.pathname
  const shareToken = path.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/)?.[1]
  const [view, setView] = useState<'upload' | 'history'>('upload')
  const [entries, setEntries] = useState<SavedUpload[]>(loadUploads)
  function onUploaded(data: UploadResponse) {
    setEntries(old => {
      const next = [{ token: data.token, manageKey: data.manage_key, name: data.name, createdAt: data.created_at }, ...old.filter(x => x.token !== data.token)].slice(0, 40)
      saveUploads(next)
      return next
    })
  }
  if (shareToken) return <SharePage token={shareToken}/>
  return <><Header active={view} onNav={setView}/><main className="shell main-content">{view === 'upload' ? <UploadPage onUploaded={onUploaded}/> : <HistoryPage entries={entries}/>}</main><footer className="footer shell"><div><span className="brand-mini"><ShieldCheck size={16}/> dropvault.</span><span>Private sharing, simplified.</span></div><span>Share with control.</span></footer></>
}
