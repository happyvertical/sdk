flowchart LR

subgraph 0["src"]
1["index.ts"]
subgraph 2["shared"]
3["errors.ts"]
4["factory.ts"]
subgraph 5["providers"]
6["cognito.ts"]
8["github.ts"]
9["google.ts"]
A["kanidm.ts"]
B["keycloak.ts"]
subgraph C["nostr"]
D["index.ts"]
end
end
7["types.ts"]
end
end
1-->3
1-->4
1-->7
4-->6
4-->8
4-->9
4-->A
4-->B
4-->D
4-->7
6-->3
6-->7
8-->3
8-->7
9-->3
9-->7
A-->3
A-->7
B-->3
B-->7
D-->3
D-->7
