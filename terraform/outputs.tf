output "ec2_public_ip" {
  description = "Public IP of the EC2 instance"
  value       = aws_instance.app_server.public_ip
}

output "rds_endpoint" {
  description = "Endpoint of the RDS instance"
  value       = aws_db_instance.default.endpoint
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket for documents"
  value       = aws_s3_bucket.knowledge_bucket.id
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic for S3 upload notifications"
  value       = aws_sns_topic.s3_upload_notifications.arn
}

output "webhook_url" {
  description = "Webhook endpoint URL for S3 notifications"
  value       = "https://${aws_instance.app_server.public_ip}/api/webhook/s3-upload"
}

output "ssh_command" {
  value = "ssh -i ${var.key_name}.pem ubuntu@${aws_instance.app_server.public_ip}"
}

output "setup_instructions" {
  value = <<-EOT

    📋 Post-Deployment Setup:

    1. SSH into server: ssh -i ${var.key_name}.pem ubuntu@${aws_instance.app_server.public_ip}

    2. Confirm SNS subscription:
       - Check AWS SNS Console for pending subscription
       - OR wait for webhook to receive SubscriptionConfirmation
       - Visit the SubscribeURL to confirm

    3. Test S3 auto-ingestion:
       aws s3 cp your-file.pdf s3://${aws_s3_bucket.knowledge_bucket.id}/hinduism/mahabharatam/

    4. Upload folder structure:
       s3://${aws_s3_bucket.knowledge_bucket.id}/
         hinduism/
           mahabharatam/
           ramayana/
         christianity/
           bible/
         islam/
           quran/
  EOT
}
