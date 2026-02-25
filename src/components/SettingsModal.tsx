import { useState } from 'react'
import { useAgentConfigStore, type AgentConfig } from '../store/agentConfigs'

interface Props {
  onClose: () => void
}

interface FormState {
  name: string
  command: string
  args: string // space-separated for display
}

const emptyForm = (): FormState => ({ name: '', command: '', args: '' })

function argsToArray(s: string): string[] {
  return s.trim() ? s.trim().split(/\s+/) : []
}

function argsFromJson(json: string): string {
  try {
    const arr = JSON.parse(json) as string[]
    return arr.join(' ')
  } catch {
    return ''
  }
}

export function SettingsModal({ onClose }: Props) {
  const { configs, add, update, remove, setDefault } = useAgentConfigStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(emptyForm())
  const [addForm, setAddForm] = useState<FormState>(emptyForm())
  const [showAdd, setShowAdd] = useState(false)

  const startEdit = (c: AgentConfig) => {
    setEditingId(c.id)
    setEditForm({ name: c.name, command: c.command, args: argsFromJson(c.args) })
    setShowAdd(false)
  }

  const commitEdit = async () => {
    if (!editingId) return
    await update(editingId, editForm.name, editForm.command, argsToArray(editForm.args))
    setEditingId(null)
  }

  const commitAdd = async () => {
    if (!addForm.name || !addForm.command) return
    await add(addForm.name, addForm.command, argsToArray(addForm.args))
    setAddForm(emptyForm())
    setShowAdd(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg shadow-xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <h2 className="text-base font-semibold text-zinc-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Agent configs section */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Coding Agents / Tools
            </h3>

            <div className="space-y-2">
              {configs.map((c) =>
                editingId === c.id ? (
                  <AgentForm
                    key={c.id}
                    form={editForm}
                    onChange={setEditForm}
                    onSave={commitEdit}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 bg-zinc-700/50 rounded px-3 py-2"
                  >
                    {/* Default radio */}
                    <button
                      onClick={() => setDefault(c.id)}
                      title={c.is_default ? 'Default agent' : 'Set as default'}
                      className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 transition-colors ${
                        c.is_default
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-zinc-500 hover:border-blue-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-100">{c.name}</span>
                      <span className="ml-2 text-xs text-zinc-400 font-mono">
                        {c.command}
                        {c.args !== '[]' && ` ${argsFromJson(c.args)}`}
                      </span>
                    </div>
                    {c.is_default && (
                      <span className="text-xs text-blue-400 flex-shrink-0">default</span>
                    )}
                    <button
                      onClick={() => startEdit(c)}
                      className="text-xs text-zinc-400 hover:text-zinc-100 flex-shrink-0"
                    >
                      Edit
                    </button>
                    {!c.is_default && (
                      <button
                        onClick={() => remove(c.id)}
                        className="text-xs text-zinc-500 hover:text-red-400 flex-shrink-0"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )
              )}
            </div>

            {showAdd ? (
              <div className="mt-3">
                <AgentForm
                  form={addForm}
                  onChange={setAddForm}
                  onSave={commitAdd}
                  onCancel={() => { setShowAdd(false); setAddForm(emptyForm()) }}
                />
              </div>
            ) : (
              <button
                onClick={() => { setShowAdd(true); setEditingId(null) }}
                className="mt-3 text-sm text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
              >
                + Add agent
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface AgentFormProps {
  form: FormState
  onChange: (f: FormState) => void
  onSave: () => void
  onCancel: () => void
}

function AgentForm({ form, onChange, onSave, onCancel }: AgentFormProps) {
  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...form, [key]: e.target.value }),
  })

  return (
    <div className="bg-zinc-700/50 rounded p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-zinc-400 mb-0.5 block">Display name</label>
          <input
            {...field('name')}
            placeholder="Codex"
            className="w-full bg-zinc-700 text-zinc-100 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-0.5 block">Command</label>
          <input
            {...field('command')}
            placeholder="codex"
            className="w-full bg-zinc-700 text-zinc-100 text-sm rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-0.5 block">
          Extra args <span className="text-zinc-500">(space-separated, optional)</span>
        </label>
        <input
          {...field('args')}
          placeholder="--flag value"
          className="w-full bg-zinc-700 text-zinc-100 text-sm rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onCancel}
          className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!form.name || !form.command}
          className="text-sm bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  )
}
