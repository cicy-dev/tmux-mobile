tmux send-keys -t {target} 'pwd' Enter
tmux send-keys -t {target} 'echo Starting kiro-cli' Enter
tmux send-keys -t {target} 'kiro-cli' Enter
sleep:2
tmux send-keys -t {target} t
sleep:1
tmux send-keys -t {target} 'echo Init completed' Enter