node {
  stage ("node v6") {
    sh 'init-node-ci 6'
  }

  stage ("scm") {
    checkout scm
    sh 'init-jenkins-node-scripts'
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
        npm i -g yarn
        yarn install
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

    stage ("release") {
      sh '''
        #!/bin/bash
        source ./scripts/jenkins_env.bash
        ./scripts/jenkins_release.bash
      '''
    }
  }
}
