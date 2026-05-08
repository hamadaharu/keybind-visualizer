import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle2, Keyboard as KeyboardIcon, Search, Code, LayoutList, Info, MousePointer2 } from 'lucide-react';

// --- Default Data ---
const defaultDwm = `static Key keys[] = {
	/* modifier                     key        function        argument */
	{ MODKEY,                       XK_p,      spawn,          {.v = dmenucmd } },
	{ MODKEY|ShiftMask,             XK_Return, spawn,          {.v = termcmd } },
	{ MODKEY,                       XK_b,      togglebar,      {0} },
	{ MODKEY,                       XK_j,      focusstack,     {.i = +1 } },
	{ MODKEY,                       XK_k,      focusstack,     {.i = -1 } },
	{ MODKEY,                       XK_Return, zoom,           {0} },
	{ MODKEY,                       XK_Tab,    view,           {0} },
	{ MODKEY|ShiftMask,             XK_c,      killclient,     {0} },
	{ MODKEY|ControlMask,           XK_q,      quit,           {0} },
    { MODKEY,                       XK_comma,  focusmon,       {.i = -1 } },
	{ MODKEY,                       XK_period, focusmon,       {.i = +1 } },
};`;

const defaultSxhkd = `# Terminal
super + Return
	alacritty

# Web Browser
super + w
	firefox

# Close Window (Conflict example with DWM)
super + shift + c
	bspc node -c

# Expand example
super + {alt,ctrl} + m
	music-player {play,pause}

# Screenshots
super + shift + s
    flameshot gui
`;

// --- Normalization Maps ---
const keyNameMap = {
    'minus': '-', 'equal': '=', 'bracketleft': '[', 'bracketright': ']', 'backslash': '\\',
    'semicolon': ';', 'apostrophe': "'", 'comma': ',', 'period': '.', 'slash': '/', 'grave': '`',
    'return': 'enter', 'escape': 'esc', 'space': 'space', 'tab': 'tab',
    'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right', 'print': 'prtscr'
};

const normalizeKeyName = (key) => {
    let lower = key.toLowerCase().replace('xk_', '');
    return keyNameMap[lower] || lower;
};

// --- Parser Utilities ---
const standardizeKey = (mods, key) => {
    const cleanedMods = mods.map(m => {
        let l = m.toLowerCase().replace('mask', '');
        if (l === 'modkey' || l === 'mod4') return 'super';
        if (l === 'mod1') return 'alt';
        if (l === 'control') return 'ctrl';
        return l;
    }).filter(Boolean);

    const cleanedKey = normalizeKeyName(key);
    const uniqueMods = [...new Set(cleanedMods)].sort();
    return {
        mods: uniqueMods,
        key: cleanedKey,
        fullString: [...uniqueMods, cleanedKey].join(' + ')
    };
};

const expandSxhkd = (bindingStr) => {
    const regex = /\{([^}]+)\}/;
    const match = bindingStr.match(regex);
    if (!match) return [bindingStr];

    const options = match[1].split(',');
    const results = [];
    for (const opt of options) {
        let replacement = opt.trim();
        if (replacement === '_') replacement = '';
        let newStr = bindingStr.replace(match[0], replacement);
        newStr = newStr.replace(/\s*\+\s*\+/g, '+').replace(/(^\s*\+|\+\s*$)/g, '').trim();
        results.push(...expandSxhkd(newStr));
    }
    return results;
};

const parseDwmConfig = (text) => {
    const results = [];
    const lines = text.split('\n');
    const regex = /\{\s*([^,]+?)\s*,\s*(XK_[^,]+?)\s*,\s*([^,]+?)\s*,\s*(.+?)\s*\}/;

    lines.forEach((line, index) => {
        if (line.trim().startsWith('/*') || line.trim().startsWith('//')) return;
        const match = regex.exec(line);
        if (match) {
            const rawMods = match[1].split('|').map(s => s.trim());
            const std = standardizeKey(rawMods, match[2].trim());
            results.push({
                id: `dwm-${index}`,
                source: 'dwm',
                action: `${match[3].trim()} ${match[4].trim()}`.replace('{', '').replace('}', '').trim(),
                parsed: std,
                rawLine: line.trim()
            });
        }
    });
    return results;
};

const parseSxhkdConfig = (text) => {
    const results = [];
    const lines = text.split('\n');
    let currentBindings = [];

    lines.forEach((line, index) => {
        const tLine = line.trimEnd();
        if (tLine === '' || tLine.startsWith('#')) return;

        if (!tLine.startsWith(' ') && !tLine.startsWith('\t')) {
            currentBindings = expandSxhkd(tLine.trim());
        } else if (currentBindings.length > 0) {
            const command = tLine.trim();
            currentBindings.forEach((binding, bIndex) => {
                const parts = binding.split('+').map(p => p.trim());
                const key = parts.pop();
                const std = standardizeKey(parts, key);
                results.push({
                    id: `sxhkd-${index}-${bIndex}`,
                    source: 'sxhkd',
                    action: command,
                    parsed: std,
                    rawLine: binding
                });
            });
            currentBindings = [];
        }
    });
    return results;
};

// --- Keyboard Layout Data ---
const keyboardLayout = [
    ['esc', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'],
    ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'backspace'],
    ['tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
    ['caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'enter'],
    ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'up'],
    ['ctrl', 'super', 'alt', 'space', 'alt', 'super', 'left', 'down', 'right']
];

const modifierKeys = ['ctrl', 'super', 'alt', 'shift'];

export default function App() {
    const [dwmInput, setDwmInput] = useState(defaultDwm);
    const [sxhkdInput, setSxhkdInput] = useState(defaultSxhkd);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Virtual Keyboard State
    const [activeMods, setActiveMods] = useState(['super']); // Default super is active
    const [hoveredKeyData, setHoveredKeyData] = useState(null);

    const [parsedData, setParsedData] = useState({ dwm: [], sxhkd: [], conflicts: [], all: [] });

    // Parse Data
    useEffect(() => {
        try {
            const dwm = parseDwmConfig(dwmInput);
            const sxhkd = parseSxhkdConfig(sxhkdInput);
            const combined = [...dwm, ...sxhkd];
            
            const keyMap = {};
            const conflictsMap = new Map();

            combined.forEach(item => {
                const keyStr = item.parsed.fullString;
                if (keyMap[keyStr]) {
                    if (!conflictsMap.has(keyStr)) {
                        conflictsMap.set(keyStr, [keyMap[keyStr]]);
                    }
                    conflictsMap.get(keyStr).push(item);
                } else {
                    keyMap[keyStr] = item;
                }
            });

            setParsedData({
                dwm,
                sxhkd,
                conflicts: Array.from(conflictsMap.values()),
                all: combined
            });
        } catch (e) {
            console.error("Failed to parse configuration", e);
        }
    }, [dwmInput, sxhkdInput]);

    const filteredItems = useMemo(() => {
        if (!parsedData.all) return [];
        return parsedData.all.filter(item => 
            item.parsed.fullString.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.action.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [parsedData.all, searchTerm]);

    const toggleModifier = (mod) => {
        setActiveMods(prev => 
            prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
        );
    };

    // Find bindings for a specific key based on active modifiers
    const getBindingsForKey = (keyName) => {
        const sortedActiveMods = [...activeMods].sort();
        const targetString = [...sortedActiveMods, keyName].join(' + ');
        
        return parsedData.all.filter(item => item.parsed.fullString === targetString);
    };

    // Helper rendering badge
    const renderKeyBadges = (standardizedKeyStr) => {
        const parts = standardizedKeyStr.split(' + ');
        return (
            <div className="flex flex-wrap gap-1 items-center">
                {parts.map((p, i) => (
                    <React.Fragment key={i}>
                        <kbd className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-200 text-xs font-mono shadow-sm">
                            {p}
                        </kbd>
                        {i < parts.length - 1 && <span className="text-slate-400 text-xs">+</span>}
                    </React.Fragment>
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-300 p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-700 pb-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <KeyboardIcon className="w-8 h-8 text-blue-400" />
                            Keybind <span className="text-slate-500 font-light">Visualizer</span>
                        </h1>
                        <p className="text-sm text-slate-400 mt-1">
                            Detect conflicts and visualize your DWM + SXHKD key mapping.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <div className={`px-4 py-2 rounded-lg border text-center ${parsedData.conflicts.length > 0 ? 'bg-red-900/20 border-red-500/50' : 'bg-slate-800 border-slate-700'}`}>
                            <div className={`text-xl font-bold ${parsedData.conflicts.length > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                {parsedData.conflicts.length}
                            </div>
                            <div className={`text-xs uppercase tracking-wider ${parsedData.conflicts.length > 0 ? 'text-red-400/80' : 'text-slate-400'}`}>Conflicts</div>
                        </div>
                    </div>
                </div>

                {/* --- VISUAL KEYBOARD SECTION --- */}
                <div className="bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-white mb-2">Visual Keyboard</h2>
                            <p className="text-sm text-slate-400">
                              Click the <strong>modifier</strong> button below to see the mapping. Move the cursor to the button for details.
                            </p>
                        </div>
                        {/* Legend */}
                        <div className="flex gap-4 text-xs font-medium">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500/50 border border-blue-400 rounded"></div>DWM</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500/50 border border-emerald-400 rounded"></div>SXHKD</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500/50 border border-red-400 rounded"></div>Conflicts</div>
                        </div>
                    </div>

                    {/* Keyboard Render */}
                    <div className="flex flex-col gap-1 md:gap-2 select-none overflow-x-auto pb-4">
                        {keyboardLayout.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex justify-center gap-1 md:gap-2 min-w-max">
                                {row.map((keyName, keyIndex) => {
                                    const isModifier = modifierKeys.includes(keyName);
                                    const isActiveMod = isModifier && activeMods.includes(keyName);
                                    const bindings = getBindingsForKey(keyName);
                                    
                                    let statusClass = "bg-slate-700 text-slate-300 border-b-4 border-slate-900"; // Default
                                    
                                    if (isModifier) {
                                        statusClass = isActiveMod 
                                            ? "bg-yellow-500/20 text-yellow-300 border-yellow-500 border-b-4 shadow-[0_0_10px_rgba(234,179,8,0.3)] transform translate-y-[2px] border-b-[2px]" 
                                            : "bg-slate-700 text-slate-300 border-slate-900 border-b-4 hover:bg-slate-600 cursor-pointer";
                                    } else if (bindings.length > 0) {
                                        const hasDwm = bindings.some(b => b.source === 'dwm');
                                        const hasSxhkd = bindings.some(b => b.source === 'sxhkd');
                                        
                                        if (hasDwm && hasSxhkd) {
                                            statusClass = "bg-red-500/40 text-red-100 border-red-600 border-b-4 hover:bg-red-500/60";
                                        } else if (hasDwm) {
                                            statusClass = "bg-blue-500/40 text-blue-100 border-blue-600 border-b-4 hover:bg-blue-500/60";
                                        } else if (hasSxhkd) {
                                            statusClass = "bg-emerald-500/40 text-emerald-100 border-emerald-600 border-b-4 hover:bg-emerald-500/60";
                                        }
                                    } else {
                                        statusClass += " hover:bg-slate-600";
                                    }

                                    // Special Widths
                                    let widthClass = "w-10 sm:w-12 md:w-14";
                                    if (keyName === 'space') widthClass = "w-48 sm:w-64 md:w-80";
                                    if (keyName === 'enter') widthClass = "w-20 sm:w-24";
                                    if (keyName === 'shift' || keyName === 'caps' || keyName === 'backspace' || keyName === 'tab') widthClass = "w-16 sm:w-20";

                                    return (
                                        <div 
                                            key={keyIndex}
                                            onClick={() => isModifier && toggleModifier(keyName)}
                                            onMouseEnter={() => !isModifier && setHoveredKeyData({key: keyName, bindings})}
                                            onMouseLeave={() => !isModifier && setHoveredKeyData(null)}
                                            className={`
                                                ${widthClass} h-12 md:h-14 
                                                flex items-center justify-center rounded-lg 
                                                text-xs md:text-sm font-mono uppercase font-bold
                                                transition-all duration-150 cursor-default
                                                ${statusClass}
                                            `}
                                        >
                                            {keyName}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Hover Info Panel */}
                    <div className="mt-4 bg-slate-900 border border-slate-700 rounded-lg p-4 min-h-[5rem] flex items-center">
                        {hoveredKeyData ? (
                            hoveredKeyData.bindings.length > 0 ? (
                                <div className="w-full">
                                    <div className="flex items-center gap-3 mb-2">
                                        <kbd className="px-3 py-1 bg-slate-800 rounded border border-slate-600 font-mono text-sm text-yellow-400">
                                            {[...activeMods, hoveredKeyData.key].sort().join(' + ')}
                                        </kbd>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {hoveredKeyData.bindings.map(b => (
                                            <div key={b.id} className="bg-slate-800 p-2 rounded border border-slate-700 flex flex-col">
                                                <span className={`text-[10px] font-bold uppercase ${b.source === 'dwm' ? 'text-blue-400' : 'text-emerald-400'}`}>
                                                    {b.source}
                                                </span>
                                                <span className="font-mono text-sm">{b.action}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-slate-500 flex items-center gap-2">
                                    <Info className="w-4 h-4" />
    <span>The button <strong>{[...activeMods, hoveredKeyData.key].sort().join(' + ')}</strong> has no action.</span>
                                </div>
                            )
                        ) : (
                            <div className="text-slate-500 flex items-center gap-2">
                                <MousePointer2 className="w-4 h-4 animate-bounce" />
                                <span>Move the cursor to the button above to see its command.</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Input Area (Collapsed by default visually via flex) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <Code className="w-4 h-4 text-blue-400" />
                            DWM config.h (keys[])
                        </label>
                        <textarea 
                            value={dwmInput}
                            onChange={(e) => setDwmInput(e.target.value)}
                            className="w-full h-48 bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-xs text-blue-200 focus:outline-none focus:border-blue-500 resize-none"
    placeholder="Paste your dwm configuration here"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <LayoutList className="w-4 h-4 text-emerald-400" />
                            SXHKD Config (sxhkdrc)
                        </label>
                        <textarea 
                            value={sxhkdInput}
                            onChange={(e) => setSxhkdInput(e.target.value)}
                            className="w-full h-48 bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-xs text-emerald-200 focus:outline-none focus:border-emerald-500 resize-none"
    placeholder="Paste the contents of your sxhkdrc file here"
                        />
                    </div>
                </div>

                {/* Conflict Alert Section */}
                {parsedData.conflicts.length > 0 && (
                    <div className="bg-red-950/40 border border-red-500/50 rounded-xl p-6 shadow-lg animate-pulse">
                        <h2 className="text-xl font-bold text-red-400 flex items-center gap-2 mb-4">
                            <AlertCircle className="w-6 h-6" /> 
                            {parsedData.conflicts.length} Conflicts Found!
                        </h2>
                        <div className="grid grid-cols-1 gap-4">
                            {parsedData.conflicts.map((conflictGroup, idx) => (
                                <div key={idx} className="bg-slate-900/50 border border-red-900/50 rounded-lg p-4">
                                    <div className="mb-3">
                                        {renderKeyBadges(conflictGroup[0].parsed.fullString)}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {conflictGroup.map(item => (
                                            <div key={item.id} className="bg-slate-800 p-3 rounded border border-slate-700">
                                                <span className={`text-xs font-bold uppercase ${item.source === 'dwm' ? 'text-blue-400' : 'text-emerald-400'}`}>
                                                    {item.source}
                                                </span>
                                                <p className="font-mono text-sm text-slate-200 mt-1">{item.action}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Filter & Table Section */}
                <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden">
                    <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
                        <h2 className="text-lg font-semibold text-white">All Keybinds</h2>
                        <div className="relative w-full sm:w-72">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Search for buttons or commands..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-blue-500 text-slate-200"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-900/80 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10">
                                <tr>
                                    <th className="p-4 font-medium">Source</th>
                                    <th className="p-4 font-medium">Combination</th>
                                    <th className="p-4 font-medium">Command</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" className="p-8 text-center text-slate-500 italic">
                                        No matching results found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map(item => (
                                        <tr key={item.id} className="hover:bg-slate-700/30 transition-colors">
                                            <td className="p-4 align-top w-24">
                                                <span className={`inline-flex px-2 py-1 rounded text-[10px] font-bold uppercase ${item.source === 'dwm' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                                    {item.source}
                                                </span>
                                            </td>
                                            <td className="p-4 align-top">
                                                {renderKeyBadges(item.parsed.fullString)}
                                            </td>
                                            <td className="p-4 align-top">
                                                <span className="font-mono text-sm text-slate-200">
                                                    {item.action}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
