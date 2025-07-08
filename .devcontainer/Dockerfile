# Use official Node.js runtime as base image
FROM mcr.microsoft.com/devcontainers/typescript-node:22-bookworm

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=development
ENV FORCE_COLOR=1

# Install system dependencies for ONNX Runtime, OCR, and Ghostscript
RUN apt-get update && apt-get install -y \
    # C++ standard library and build tools
    libstdc++6 \
    libc6-dev \
    build-essential \
    gcc \
    g++ \
    cmake \
    # Additional dependencies for ONNX Runtime
    libgomp1 \
    libprotobuf-dev \
    # Ghostscript for PDF processing
    ghostscript \
    # Git LFS for large files
    git-lfs \
    # GitHub CLI
    gh \
    # Cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH for all users
ENV PATH="/root/.bun/bin:$PATH"
RUN echo 'export PATH="/root/.bun/bin:$PATH"' >> /etc/bash.bashrc

# Set working directory
WORKDIR /workspaces

# Create non-root user for development
RUN useradd -m -s /bin/bash devuser && \
    echo "devuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Install Bun for devuser as well
USER devuser
RUN curl -fsSL https://bun.sh/install | bash
RUN echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

# Switch back to root for container initialization
USER root

# Copy package files for dependency installation
COPY package.json bun.lock* ./

# Install dependencies if package files exist
RUN if [ -f "package.json" ]; then \
    export PATH="/root/.bun/bin:$PATH" && \
    bun install; \
    fi

# Set the default user
USER devuser

# Default command
CMD ["sleep", "infinity"]