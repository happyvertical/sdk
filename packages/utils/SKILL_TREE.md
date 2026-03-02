flowchart LR

subgraph 0["src"]
1["browser.ts"]
subgraph 2["config"]
3["env-config.ts"]
end
subgraph 4["shared"]
subgraph 5["code"]
6["extraction.ts"]
7["validation.ts"]
H["index.ts"]
I["sandbox.ts"]
end
8["logger.ts"]
9["types.ts"]
A["universal.ts"]
G["index.ts"]
end
subgraph B["cli"]
C["claude-context.ts"]
D["index.ts"]
E["parse-args.ts"]
end
F["index.ts"]
J["web.ts"]
end
1-->3
1-->6
1-->7
1-->8
1-->9
1-->A
8-->9
A-->9
D-->E
F-->D
F-->3
F-->G
F-->J
G-->H
G-->8
G-->9
G-->A
H-->6
H-->I
H-->7
