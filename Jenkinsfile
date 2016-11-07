node {
  stage ("node v6") {
    sh '''
      #!/bin/bash
      set +x
      source ~/.nvm/nvm.sh
      nvm install 6
    '''
  }

  stage ("scm") {
    checkout scm
    sh './scripts/jenkins_setup_git.bash'
  }

  env.CACHE_CONTEXT='remote-state-stream'
  wrap([$class: 'AnsiColorBuildWrapper', 'colorMapName': 'XTerm']) {
    stage ("cache-download") {
      sh '''
        #!/bin/bash
        source ./scripts/jenkins_env.bash
        ./scripts/init_cache.bash
      '''
    }

    stage ("install") {
      sh '''
        #!/bin/bash
        source ./scripts/jenkins_env.bash
        enable-npm-proxy
        npm install
        npm prune
      '''
    }

    stage ("cache-upload") {
      sh '''
        #!/bin/bash
        source ./scripts/jenkins_env.bash
        ./scripts/finalize_cache.bash
      '''
    }

    stage ("test") {
      sh '''
        #!/bin/bash
        source ./scripts/jenkins_env.bash
        npm run ci
      '''
    }
  }
}
