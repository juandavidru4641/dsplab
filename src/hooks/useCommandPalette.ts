import { useState, useCallback, useMemo } from 'react';

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

export function useCommandPalette(commands: Command[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const open = useCallback(() => { setIsOpen(true); setQuery(''); }, []);
  const close = useCallback(() => { setIsOpen(false); setQuery(''); }, []);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd => cmd.label.toLowerCase().includes(q));
  }, [commands, query]);

  const execute = useCallback((id: string) => {
    const cmd = commands.find(c => c.id === id);
    if (cmd) {
      cmd.action();
      close();
    }
  }, [commands, close]);

  return { isOpen, query, setQuery, open, close, filteredCommands, execute };
}
