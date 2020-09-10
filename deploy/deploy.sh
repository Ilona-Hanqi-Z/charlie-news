#!/usr/bin/env bash

# This script deploys the docker image built in circleci to our AWS ECS cluster.
# Depending on the argument passed, it will either deploy to the dev or prod cluster

environment=$1

if [ ${environment} = "" ]; then
    echo "No Target Supplied";
    echo "Available targets are dev, prod"
    exit 10
fi

# Use correct resources for environment
if [ ${environment} = "dev" ]; then
    echo "Deploying to Dev"
    db_security_group="sg-d774acaf"
    container_memory="512"
elif [ ${environment} = "prod" ]; then
    echo "Deploying to Prod"
    db_security_group="sg-1dc5d967"
    container_memory="1024"
else
    echo "Unknown target ${environment}"
    echo "Available targets are dev, prod"
    exit 11
fi

cluster="fresco-api-${environment}"
service="fresco-api-${environment}"
task_family="fresco-api-${environment}"
repository="fresco-api-${environment}"
container_name="fresco-api-${environment}"
task_role="arn:aws:iam::285790714321:role/fresco-api-${environment}-role"
config_path="./config/${environment}"

# more bash-friendly output for jq
JQ="jq --raw-output --exit-status"

configure_aws_cli(){
	aws --version
	aws configure set default.region us-east-1
	aws configure set default.output json
}

# Update the service to use the new task definition, effectively deploying it
deploy_cluster() {

    family=$environment

    make_task_def
    register_definition
    if [[ $(aws ecs update-service --cluster ${cluster} --service ${service} --task-definition ${revision} | \
                   $JQ '.service.taskDefinition') != ${revision} ]]; then
        echo "Error updating service."
        return 1
    fi

    migrate_db

    echo "Deployed!"
    return 0
}

# Create a new revision of the task definition
make_task_def(){
	task_template='[
		{
			"name": "%s",
			"image": "%s.dkr.ecr.us-east-1.amazonaws.com/%s:%s",
			"essential": true,
			"memory": %s,
			"cpu": 0,
			"portMappings": [
				{
					"containerPort": 4040,
					"hostPort": 0,
					"protocol": "tcp"
				}
			],
			"environment": [
                {
                    "name": "FRESCO_CONFIG",
                    "value": "%s"
                }
            ]
		}
	]'



	task_def=$(printf "$task_template" ${container_name} ${AWS_ACCOUNT_ID} ${repository} ${CIRCLE_SHA1} ${container_memory} ${config_path})
}

# Push the built docker image to the aws repo
push_ecr_image(){
	eval $(aws ecr get-login --region us-east-1)
	docker tag fresco-api:latest ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${repository}:$CIRCLE_SHA1
	docker push ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${repository}:$CIRCLE_SHA1
}

# Upload the task definition to AWS
register_definition() {

    if revision=$(aws ecs register-task-definition --container-definitions "$task_def" --family ${task_family} --task-role-arn ${task_role} | $JQ '.taskDefinition.taskDefinitionArn'); then
        echo "Revision: $revision"
    else
        echo "Failed to register task definition"
        return 1
    fi

}

# Update the database, adding and removing ourselves from the security group
migrate_db() {
    public_ip_address=$(wget -qO- http://checkip.amazonaws.com)
    echo "Adding ${public_ip_address} to security group ${db_security_group}"
    aws ec2 authorize-security-group-ingress --region us-east-1 --group-id ${db_security_group} --ip-permissions "[{\"IpProtocol\": \"tcp\", \"FromPort\": 6859, \"ToPort\": 6859, \"IpRanges\": [{\"CidrIp\": \"${public_ip_address}/32\"}]}]"

    cd migration
    node migrate ${environment}

    echo "Removing ${public_ip_address} from security group ${db_security_group}"
    aws ec2 revoke-security-group-ingress --region us-east-1 --group-id ${db_security_group} --protocol tcp --port 6859 --cidr "${public_ip_address}/32"
}

configure_aws_cli
push_ecr_image
deploy_cluster