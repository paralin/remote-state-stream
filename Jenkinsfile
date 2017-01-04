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
        source ./jenkins_scripts/jenkins_env.bash
        ./jenkins_scripts/init_cache.bash ./.yarn-cache/
      '''
    }

    stage ("install") {
      sh '''
        #!/bin/bash
        source ./jenkins_scripts/jenkins_env.bash
        enable-npm-proxy
        npm i -g yarn
        yarn install --cache-folder ./.yarn-cache/
      '''
    }

    stage ("cache-upload") {
      sh '''
        #!/bin/bash
        source ./jenkins_scripts/jenkins_env.bash
        ./jenkins_scripts/finalize_cache.bash ./.yarn-cache/
      '''
    }

    stage ("test") {
      sh '''
        #!/bin/bash
        source ./jenkins_scripts/jenkins_env.bash
        npm run ci
      '''
    }

    stage ("release") {
      sh '''
        #!/bin/bash
        source ./jenkins_scripts/jenkins_env.bash
        ./jenkins_scripts/jenkins_release.bash release
      '''
    }
  }
}
